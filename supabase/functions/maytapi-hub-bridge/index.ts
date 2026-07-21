// Maytapi Hub Bridge — arbitrates WhatsApp sends across all suite spokes.
// The hub NEVER talks to Maytapi directly. Spokes call the gateway and
// report events here. Hub answers: "may I send?" (dnc_check),
// "I sent" (send_recorded), "user replied STOP" (inbound_stop), plus
// events_backfill and ping.
//
// Signing: HMAC-SHA256 over `${ts}.${nonce}.${app_key}.${JSON.stringify(body)}`
// using SUITE_BRIDGE_SECRET. Same scheme as suite-bridge-hub.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HASH_SALT = Deno.env.get("MAYTAPI_HASH_SALT") ?? "";

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

  // Resolve per-spoke secret via registry (bridge_secret_slot env var)
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
        return json(200, { ok: true, hub: "maytapi-hub-bridge", app_key, at: new Date().toISOString() });
      }

      case "dnc_check": {
        // { phone, event_class? }
        const phone = String(body?.phone ?? "");
        const eventClass = String(body?.event_class ?? "default");
        if (!phone) return json(400, { ok: false, error: "phone_required" });

        const p_hash = await phoneHash(phone);
        if (!p_hash) return json(500, { ok: false, error: "hash_salt_missing" });

        // 1. DNC lookup
        const { data: dnc } = await sb
          .from("suite_maytapi_dnc")
          .select("reason,recorded_at,cleared_at")
          .eq("phone_hash", p_hash)
          .is("cleared_at", null)
          .maybeSingle();
        if (dnc) {
          return json(200, {
            ok: true,
            allowed: false,
            blocked_until: null,
            reason: `dnc:${dnc.reason}`,
            recorded_at: dnc.recorded_at,
          });
        }

        // 2. Cooldown lookup
        const { data: cd } = await sb
          .from("suite_maytapi_cooldowns")
          .select("cooldown_seconds")
          .eq("event_class", eventClass)
          .maybeSingle();
        const cooldownSec = cd?.cooldown_seconds
          ?? (await sb.from("suite_maytapi_cooldowns").select("cooldown_seconds").eq("event_class", "default").maybeSingle()).data?.cooldown_seconds
          ?? 21600;

        // 3. Last outbound to this phone across the mesh
        const { data: last } = await sb
          .from("suite_maytapi_events")
          .select("sent_at,spoke_app_key,campaign_type")
          .eq("phone_hash", p_hash)
          .eq("direction", "outbound")
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
          cooldown_seconds: cooldownSec,
          event_class: eventClass,
        });
      }

      case "send_recorded": {
        // { spoke_event_id, phone, campaign_type?, maytapi_message_id?, status?, sent_at?, metadata? }
        const spoke_event_id = String(body?.spoke_event_id ?? "");
        const phone = String(body?.phone ?? "");
        if (!spoke_event_id || !phone) return json(400, { ok: false, error: "missing_fields" });

        const p_hash = await phoneHash(phone);
        if (!p_hash) return json(500, { ok: false, error: "hash_salt_missing" });

        const row = {
          spoke_app_key: app_key,
          spoke_event_id,
          phone_hash: p_hash,
          phone_last4: last4(phone),
          direction: "outbound" as const,
          campaign_type: body?.campaign_type ?? null,
          maytapi_message_id: body?.maytapi_message_id ?? null,
          status: (body?.status as string) ?? "sent",
          sent_at: body?.sent_at ?? new Date().toISOString(),
          metadata: body?.metadata ?? {},
        };

        const { error } = await sb
          .from("suite_maytapi_events")
          .upsert(row, { onConflict: "spoke_app_key,spoke_event_id" });
        if (error) return json(500, { ok: false, error: error.message });
        return json(200, { ok: true, recorded: true });
      }

      case "inbound_stop": {
        // { phone, keyword?, message_id?, received_at? }
        const phone = String(body?.phone ?? "");
        if (!phone) return json(400, { ok: false, error: "phone_required" });
        const p_hash = await phoneHash(phone);
        if (!p_hash) return json(500, { ok: false, error: "hash_salt_missing" });

        const { error } = await sb
          .from("suite_maytapi_dnc")
          .upsert(
            {
              phone_hash: p_hash,
              phone_last4: last4(phone),
              reason: "stop_keyword",
              source_spoke: app_key,
              recorded_at: body?.received_at ?? new Date().toISOString(),
              cleared_at: null,
              metadata: { keyword: body?.keyword ?? "STOP", message_id: body?.message_id ?? null },
            },
            { onConflict: "phone_hash" },
          );
        if (error) return json(500, { ok: false, error: error.message });

        // Also log as inbound event
        await sb.from("suite_maytapi_events").insert({
          spoke_app_key: app_key,
          spoke_event_id: `stop-${p_hash.slice(0, 12)}-${Date.now()}`,
          phone_hash: p_hash,
          phone_last4: last4(phone),
          direction: "inbound",
          campaign_type: "stop",
          status: "delivered",
          sent_at: body?.received_at ?? new Date().toISOString(),
          metadata: { keyword: body?.keyword ?? "STOP" },
        });

        return json(200, { ok: true, dnc: true });
      }

      case "events_backfill": {
        // { events: [{ spoke_event_id, phone, direction, campaign_type?, status?, sent_at?, metadata? }] }
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
