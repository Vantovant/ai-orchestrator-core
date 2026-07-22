// Maytapi Hub Bridge — arbitrates WhatsApp sends across all suite spokes.
// v2: adds WhatsApp → Email fan-out (Contract Addendum v2), channel-aware
// DNC, and richer send_recorded metadata pass-through.
//
// Signing: HMAC-SHA256 over `${ts}.${nonce}.${app_key}.${JSON.stringify(body)}`
// using per-spoke secret resolved via vos_suite_apps.bridge_secret_slot.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HASH_SALT = Deno.env.get("MAYTAPI_HASH_SALT") ?? "";
const FANOUT_ENFORCE = (Deno.env.get("MAYTAPI_FANOUT_ENFORCE") ?? "false").toLowerCase() === "true";

const enc = new TextEncoder();

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(msg));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizePhone(raw: string): string {
  return (raw || "").replace(/[^\d+]/g, "").replace(/^00/, "+");
}

async function phoneHash(phone: string): Promise<string> {
  const p = normalizePhone(phone);
  if (!p || !HASH_SALT) return "";
  return await sha256Hex(`${HASH_SALT}.${p}`);
}

function last4(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.slice(-4).padStart(4, "•");
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifySignature(req: Request, rawBody: string, sb: any): Promise<
  { ok: true; app_key: string } | { ok: false; error: string }
> {
  const app_key = req.headers.get("x-bridge-app") ?? "";
  const ts = req.headers.get("x-bridge-timestamp") ?? "";
  const nonce = req.headers.get("x-bridge-nonce") ?? "";
  const sig = req.headers.get("x-bridge-signature") ?? "";
  if (!app_key || !ts || !nonce || !sig) return { ok: false, error: "missing_headers" };

  const drift = Math.abs(Date.now() - Number(ts));
  if (!Number.isFinite(drift) || drift > 5 * 60 * 1000) {
    return { ok: false, error: "timestamp_drift" };
  }

  const { data: app } = await sb
    .from("vos_suite_apps")
    .select("app_key, bridge_secret_slot, is_active")
    .eq("app_key", app_key)
    .maybeSingle();
  if (!app) return { ok: false, error: "unknown_app_key" };
  if (!app.is_active) return { ok: false, error: "app_inactive" };
  const secret = Deno.env.get(app.bridge_secret_slot) ?? "";
  if (!secret) return { ok: false, error: `secret_missing:${app.bridge_secret_slot}` };

  const expected = await hmacHex(secret, `${ts}.${nonce}.${app_key}.${rawBody}`);
  if (expected !== sig) return { ok: false, error: "bad_signature" };
  return { ok: true, app_key };
}

// ---------- Fan-out evaluator ----------
//
// After a send_recorded row lands, look up policy. If disabled → 'none'.
// If enabled:
//   - Check suppress_if: no_email (contact.email missing) or dnc_email
//   - If suppressed → 'suppressed' with reason.
//   - Else if FANOUT_ENFORCE=false → 'shadow_logged' (no dispatch).
//   - Else → sign + POST to email spoke; on 2xx 'dispatched', else 'failed'.
async function evaluateFanout(
  sb: any,
  eventId: string,
  spoke_app_key: string,
  spoke_event_id: string,
  campaign_type: string | null,
  metadata: Record<string, any>,
): Promise<void> {
  if (!campaign_type) return;

  const { data: policy } = await sb
    .from("suite_maytapi_fanout_policy")
    .select("*")
    .eq("campaign_type", campaign_type)
    .maybeSingle();

  if (!policy || !policy.enabled) {
    await sb.from("suite_maytapi_events").update({
      fanout_state: "none",
      fanout_decided_at: new Date().toISOString(),
      fanout_reason: policy ? "policy_disabled" : "no_policy",
    }).eq("id", eventId);
    return;
  }

  const contact = (metadata?.contact ?? {}) as Record<string, any>;
  const email: string | undefined =
    (metadata?.email as string) ||
    contact.email_address ||
    contact.email;
  const suppressIf: string[] = Array.isArray(policy.suppress_if) ? policy.suppress_if : [];

  // Suppression: no_email
  if (suppressIf.includes("no_email") && !email) {
    await sb.from("suite_maytapi_events").update({
      fanout_state: "suppressed",
      fanout_decided_at: new Date().toISOString(),
      fanout_reason: "no_email",
    }).eq("id", eventId);
    return;
  }

  // Suppression: dnc_email
  if (suppressIf.includes("dnc_email") && email) {
    const emailHash = await sha256Hex(`${HASH_SALT}.${email.toLowerCase().trim()}`);
    const { data: dncEmail } = await sb
      .from("suite_maytapi_dnc")
      .select("phone_hash")
      .eq("phone_hash", emailHash)
      .in("channel", ["email", "all"])
      .is("cleared_at", null)
      .maybeSingle();
    if (dncEmail) {
      await sb.from("suite_maytapi_events").update({
        fanout_state: "suppressed",
        fanout_decided_at: new Date().toISOString(),
        fanout_reason: "dnc_email",
      }).eq("id", eventId);
      return;
    }
  }

  // Shadow mode: log intent, no dispatch
  if (!FANOUT_ENFORCE) {
    await sb.from("suite_maytapi_events").update({
      fanout_state: "shadow_logged",
      fanout_decided_at: new Date().toISOString(),
      fanout_reason: `would_dispatch:${policy.email_spoke_app_key}:${policy.template_hint ?? ""}`,
    }).eq("id", eventId);
    return;
  }

  // Live dispatch to email spoke
  const { data: emailApp } = await sb
    .from("vos_suite_apps")
    .select("app_key, url, bridge_secret_slot, is_active")
    .eq("app_key", policy.email_spoke_app_key)
    .maybeSingle();

  if (!emailApp || !emailApp.is_active || !emailApp.url) {
    await sb.from("suite_maytapi_events").update({
      fanout_state: "failed",
      fanout_decided_at: new Date().toISOString(),
      fanout_reason: "email_spoke_missing_or_inactive",
    }).eq("id", eventId);
    return;
  }

  const emailSecret = Deno.env.get(emailApp.bridge_secret_slot) ?? "";
  if (!emailSecret) {
    await sb.from("suite_maytapi_events").update({
      fanout_state: "failed",
      fanout_decided_at: new Date().toISOString(),
      fanout_reason: `email_secret_missing:${emailApp.bridge_secret_slot}`,
    }).eq("id", eventId);
    return;
  }

  const tier = (metadata?.tier as string) || (metadata?.tone as string) || "starter";
  const templateHint = (policy.template_hint ?? "").replace(/\{tier\}/g, tier);

  const idempotencyKey = `${spoke_app_key}:${spoke_event_id}:email`;
  const bodyObj = {
    action: "email_dispatch",
    idempotency_key: idempotencyKey,
    body: {
      hub_event_id: eventId,
      origin_app: spoke_app_key,
      origin_event_id: spoke_event_id,
      campaign_type,
      template_hint: templateHint,
      delay_minutes: policy.delay_minutes,
      contact: {
        email,
        first_name: contact.first_name,
        aplgo_id: contact.aplgo_id,
        country: contact.country,
      },
      message: {
        body_preview: metadata?.body_preview,
        tier: metadata?.tier,
        tone: metadata?.tone,
      },
      sent_at: new Date().toISOString(),
      idempotency_key: idempotencyKey,
    },
  };
  const rawBody = JSON.stringify(bodyObj);
  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const sig = await hmacHex(emailSecret, `${ts}.${nonce}.vantoos_hub.${rawBody}`);

  try {
    const url = `${emailApp.url.replace(/\/$/, "")}/functions/v1/hub-email-dispatch`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-app": "vantoos_hub",
        "x-bridge-timestamp": ts,
        "x-bridge-nonce": nonce,
        "x-bridge-signature": sig,
        "x-idempotency-key": idempotencyKey,
      },
      body: rawBody,
    });
    const respText = await resp.text();
    if (resp.ok) {
      let emailSendId: string | null = null;
      try {
        emailSendId = JSON.parse(respText)?.email_send_id ?? null;
      } catch { /* ignore */ }
      await sb.from("suite_maytapi_events").update({
        fanout_state: "dispatched",
        fanout_decided_at: new Date().toISOString(),
        fanout_email_send_id: emailSendId,
        fanout_reason: `ok:${policy.email_spoke_app_key}`,
      }).eq("id", eventId);
    } else {
      await sb.from("suite_maytapi_events").update({
        fanout_state: "failed",
        fanout_decided_at: new Date().toISOString(),
        fanout_reason: `spoke_status_${resp.status}:${respText.slice(0, 200)}`,
      }).eq("id", eventId);
    }
  } catch (e) {
    await sb.from("suite_maytapi_events").update({
      fanout_state: "failed",
      fanout_decided_at: new Date().toISOString(),
      fanout_reason: `fetch_error:${(e as Error).message}`,
    }).eq("id", eventId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const rawBody = await req.text();

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const verified = await verifySignature(req, rawBody, sb);
  if (!verified.ok) return json(401, { ok: false, error: verified.error });
  const app_key = verified.app_key;

  let parsed: any;
  try {
    parsed = JSON.parse(rawBody || "{}");
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }
  const action = parsed?.action as string;
  const body = parsed?.body ?? {};

  try {
    switch (action) {
      case "ping": {
        return json(200, {
          ok: true,
          hub: "maytapi-hub-bridge",
          version: "v2",
          fanout_enforce: FANOUT_ENFORCE,
          app_key,
          at: new Date().toISOString(),
        });
      }

      case "dnc_check": {
        const phone = String(body?.phone ?? "");
        const eventClass = String(body?.event_class ?? "default");
        const channel = String(body?.channel ?? "whatsapp");
        if (!phone) return json(400, { ok: false, error: "phone_required" });

        const p_hash = await phoneHash(phone);
        if (!p_hash) return json(500, { ok: false, error: "hash_salt_missing" });

        const { data: dnc } = await sb
          .from("suite_maytapi_dnc")
          .select("reason,recorded_at,cleared_at,channel")
          .eq("phone_hash", p_hash)
          .in("channel", [channel, "all"])
          .is("cleared_at", null)
          .maybeSingle();
        if (dnc) {
          return json(200, {
            ok: true,
            allowed: false,
            blocked_until: null,
            reason: `dnc:${dnc.reason}`,
            channel,
            recorded_at: dnc.recorded_at,
          });
        }

        const { data: cd } = await sb
          .from("suite_maytapi_cooldowns")
          .select("cooldown_seconds")
          .eq("event_class", eventClass)
          .maybeSingle();
        const cooldownSec = cd?.cooldown_seconds
          ?? (await sb.from("suite_maytapi_cooldowns").select("cooldown_seconds").eq("event_class", "default").maybeSingle()).data?.cooldown_seconds
          ?? 21600;

        const { data: last } = await sb
          .from("suite_maytapi_events")
          .select("sent_at,spoke_app_key,campaign_type")
          .eq("phone_hash", p_hash)
          .eq("direction", "outbound")
          .eq("channel", channel)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (last) {
          const nextOkAt = new Date(new Date(last.sent_at).getTime() + cooldownSec * 1000);
          if (nextOkAt.getTime() > Date.now()) {
            return json(200, {
              ok: true,
              allowed: false,
              blocked_until: nextOkAt.toISOString(),
              reason: "cooldown",
              channel,
              last_sent_at: last.sent_at,
              last_sent_by: last.spoke_app_key,
              last_campaign_type: last.campaign_type,
              cooldown_seconds: cooldownSec,
              event_class: eventClass,
            });
          }
        }

        return json(200, {
          ok: true,
          allowed: true,
          blocked_until: null,
          channel,
          cooldown_seconds: cooldownSec,
          event_class: eventClass,
        });
      }

      case "send_recorded": {
        const spoke_event_id = String(body?.spoke_event_id ?? "");
        const phone = String(body?.phone ?? "");
        const channel = String(body?.channel ?? "whatsapp");
        if (!spoke_event_id || !phone) return json(400, { ok: false, error: "missing_fields" });

        const p_hash = await phoneHash(phone);
        if (!p_hash) return json(500, { ok: false, error: "hash_salt_missing" });

        const metadata = body?.metadata ?? {};
        const campaign_type = body?.campaign_type ?? null;

        const row = {
          spoke_app_key: app_key,
          spoke_event_id,
          phone_hash: p_hash,
          phone_last4: last4(phone),
          direction: "outbound" as const,
          channel,
          campaign_type,
          maytapi_message_id: body?.maytapi_message_id ?? null,
          status: (body?.status as string) ?? "sent",
          sent_at: body?.sent_at ?? new Date().toISOString(),
          metadata,
        };

        const { data: upserted, error } = await sb
          .from("suite_maytapi_events")
          .upsert(row, { onConflict: "spoke_app_key,spoke_event_id" })
          .select("id")
          .maybeSingle();
        if (error) return json(500, { ok: false, error: error.message });

        // Fan-out evaluation (only for whatsapp outbound with a campaign_type)
        let fanout: any = { state: "skipped" };
        if (upserted?.id && channel === "whatsapp" && campaign_type) {
          await evaluateFanout(sb, upserted.id, app_key, spoke_event_id, campaign_type, metadata);
          const { data: after } = await sb
            .from("suite_maytapi_events")
            .select("fanout_state,fanout_reason,fanout_email_send_id")
            .eq("id", upserted.id)
            .maybeSingle();
          fanout = after ?? { state: "unknown" };
        }
        return json(200, { ok: true, recorded: true, event_id: upserted?.id, fanout });
      }

      case "inbound_stop": {
        const phone = String(body?.phone ?? "");
        const channel = String(body?.channel ?? "whatsapp");
        if (!phone) return json(400, { ok: false, error: "phone_required" });
        const p_hash = await phoneHash(phone);
        if (!p_hash) return json(500, { ok: false, error: "hash_salt_missing" });

        const { error } = await sb
          .from("suite_maytapi_dnc")
          .upsert(
            {
              phone_hash: p_hash,
              phone_last4: last4(phone),
              channel,
              reason: "stop_keyword",
              source_spoke: app_key,
              recorded_at: body?.received_at ?? new Date().toISOString(),
              cleared_at: null,
              metadata: { keyword: body?.keyword ?? "STOP", message_id: body?.message_id ?? null },
            },
            { onConflict: "phone_hash,channel" },
          );
        if (error) return json(500, { ok: false, error: error.message });

        await sb.from("suite_maytapi_events").insert({
          spoke_app_key: app_key,
          spoke_event_id: `stop-${p_hash.slice(0, 12)}-${Date.now()}`,
          phone_hash: p_hash,
          phone_last4: last4(phone),
          direction: "inbound",
          channel,
          campaign_type: "stop",
          status: "delivered",
          sent_at: body?.received_at ?? new Date().toISOString(),
          metadata: { keyword: body?.keyword ?? "STOP" },
        });

        return json(200, { ok: true, dnc: true, channel });
      }

      case "events_backfill": {
        const events: any[] = Array.isArray(body?.events) ? body.events : [];
        if (!events.length) return json(400, { ok: false, error: "events_required" });
        if (events.length > 500) return json(400, { ok: false, error: "batch_too_large" });

        const rows = await Promise.all(
          events.map(async (e) => {
            const p_hash = await phoneHash(String(e?.phone ?? ""));
            return {
              spoke_app_key: app_key,
              spoke_event_id: String(e?.spoke_event_id ?? ""),
              phone_hash: p_hash,
              phone_last4: last4(String(e?.phone ?? "")),
              direction: (e?.direction as string) === "inbound" ? "inbound" : "outbound",
              channel: (e?.channel as string) ?? "whatsapp",
              campaign_type: e?.campaign_type ?? null,
              maytapi_message_id: e?.maytapi_message_id ?? null,
              status: e?.status ?? "sent",
              sent_at: e?.sent_at ?? new Date().toISOString(),
              metadata: e?.metadata ?? {},
            };
          }),
        );
        const valid = rows.filter((r) => r.spoke_event_id && r.phone_hash);
        const { error, count } = await sb
          .from("suite_maytapi_events")
          .upsert(valid, { onConflict: "spoke_app_key,spoke_event_id", count: "exact" });
        if (error) return json(500, { ok: false, error: error.message });
        return json(200, { ok: true, received: events.length, upserted: count ?? valid.length });
      }

      default:
        return json(400, { ok: false, error: `unknown_action:${action}` });
    }
  } catch (e) {
    return json(500, { ok: false, error: (e as Error).message });
  }
});
