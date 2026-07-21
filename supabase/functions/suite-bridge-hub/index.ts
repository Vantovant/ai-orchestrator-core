// VantoOS — Suite Bridge (HUB)
// Signs outbound directives to spokes, verifies inbound snapshots.
// HMAC-SHA256 over: `${timestamp}.${nonce}.${app_key}.${body}` with per-spoke secret.
// Timestamp window: ±300s. Nonces recorded via vos_signed_inbox (existing table).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bridge-signature, x-bridge-timestamp, x-bridge-nonce, x-bridge-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIG_WINDOW_SECONDS = 300;
const OUTBOUND_SIGNING_ALIAS: Record<string, string> = {
  // getwell_hub currently shares the Vanto CRM spoke runtime. That runtime verifies
  // inbound hub messages with the vanto_crm signing identity, while the registry
  // still keeps getwell_hub as a distinct contact-sync target.
  getwell_hub: "vanto_crm",
};

const enc = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const action = payload?.action as string | undefined;
  if (!action) return json({ error: "missing_action" }, 400);

  // Helper: sign+deliver a single body to one spoke, return {status, body, nonce}
  async function deliverToSpoke(app_key: string, body: unknown) {
    const { data: app } = await supabase
      .from("vos_suite_apps")
      .select("app_key, name, url, bridge_secret_slot, is_active, role")
      .eq("app_key", app_key)
      .maybeSingle();
    if (!app) return { ok: false, error: "unknown_app", status: 404, nonce: null };
    if (!app.is_active) return { ok: false, error: "app_inactive", status: 400, nonce: null };
    if (app.role !== "spoke") return { ok: false, error: "not_a_spoke", status: 400, nonce: null };
    let signingApp = app;
    const signingAlias = OUTBOUND_SIGNING_ALIAS[app.app_key];
    if (signingAlias) {
      const { data: aliasApp } = await supabase
        .from("vos_suite_apps")
        .select("app_key, bridge_secret_slot, is_active")
        .eq("app_key", signingAlias)
        .maybeSingle();
      if (!aliasApp || !aliasApp.is_active) return { ok: false, error: "signing_alias_inactive", status: 500, nonce: null };
      signingApp = { ...app, app_key: aliasApp.app_key, bridge_secret_slot: aliasApp.bridge_secret_slot };
    }

    const secret = Deno.env.get(signingApp.bridge_secret_slot);
    if (!secret) return { ok: false, error: "missing_secret", status: 500, nonce: null };

    const outboundBody = signingAlias && typeof body === "object" && body !== null
      ? { ...(body as Record<string, unknown>), target_app_key: app.app_key }
      : body;
    const bodyStr = JSON.stringify(outboundBody);
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const sig = await hmacSha256Hex(secret, `${ts}.${nonce}.${signingApp.app_key}.${bodyStr}`);
    const target = new URL("/functions/v1/suite-bridge-spoke", app.url).toString();

    try {
      const resp = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-bridge-app": "vantoos",
          "x-bridge-timestamp": ts,
          "x-bridge-nonce": nonce,
          "x-bridge-signature": sig,
        },
        body: bodyStr,
      });
      const raw = await resp.text();
      let spokeBody: any = null;
      try { spokeBody = JSON.parse(raw); } catch { spokeBody = raw; }
      return { ok: resp.status >= 200 && resp.status < 300, status: resp.status, body: spokeBody, nonce, target };
    } catch (e) {
      return { ok: false, error: "spoke_unreachable", status: 502, nonce, target, detail: String(e) };
    }
  }

  // ---------- OUTBOUND: sign & deliver to spoke ----------
  if (action === "ping" || action === "send") {
    const app_key = payload?.app_key as string;
    const body = payload?.body ?? { kind: action === "ping" ? "ping" : "directive", ts: Date.now() };
    if (!app_key) return json({ error: "missing_app_key" }, 400);

    const res = await deliverToSpoke(app_key, body);
    const spokeStatus = res.status ?? 0;
    const spokeBody = (res as any).body ?? null;
    const target = (res as any).target ?? "";
    const nonce = res.nonce ?? crypto.randomUUID();
    if ((res as any).error === "spoke_unreachable") {
      return json({ error: "spoke_unreachable", target, detail: (res as any).detail }, 502);
    }

    await supabase.from("vos_outbound_log").insert({
      target_app: app_key,
      event_name: (body as any)?.kind ?? "directive",
      idempotency_key: nonce,
      outcome: spokeStatus >= 200 && spokeStatus < 300 ? "delivered" : "failed",
      detail: { payload: body, spoke_status: spokeStatus, spoke_body: spokeBody },
    }).then(() => {}, () => {});

    return json({ ok: spokeStatus >= 200 && spokeStatus < 300, target, spoke_status: spokeStatus, spoke_body: spokeBody });
  }

  // ---------- STRATEGY ENGINE: broadcast directive to selected spokes ----------
  if (action === "broadcast_directive") {
    const directive_id = payload?.directive_id as string;
    const app_keys = payload?.app_keys as string[];
    if (!directive_id || !Array.isArray(app_keys) || app_keys.length === 0) {
      return json({ error: "missing_directive_id_or_app_keys" }, 400);
    }
    const { data: dir, error: dirErr } = await supabase
      .from("vos_strategy_directives")
      .select("id, title, goal_text, kpi_target, horizon_days, status")
      .eq("id", directive_id)
      .maybeSingle();
    if (dirErr || !dir) return json({ error: "unknown_directive" }, 404);

    const body = {
      kind: "directive",
      directive_id: dir.id,
      title: dir.title,
      goal_text: dir.goal_text,
      kpi_target: dir.kpi_target,
      horizon_days: dir.horizon_days,
      issued_at: Date.now(),
    };

    const results = await Promise.allSettled(app_keys.map((k) => deliverToSpoke(k, body)));
    const targetRows = results.map((r, i) => {
      const app_key = app_keys[i];
      if (r.status === "fulfilled") {
        const v: any = r.value;
        return {
          directive_id,
          app_key,
          delivery_status: v.ok ? "delivered" : "failed",
          nonce: v.nonce,
          delivered_at: v.ok ? new Date().toISOString() : null,
          error: v.ok ? null : (v.error ?? `status_${v.status}`),
        };
      }
      return { directive_id, app_key, delivery_status: "failed", error: String((r as any).reason) };
    });
    await supabase.from("vos_strategy_targets").insert(targetRows).then(() => {}, () => {});
    await supabase.from("vos_strategy_directives")
      .update({ status: "broadcast" }).eq("id", directive_id).then(() => {}, () => {});

    return json({ ok: true, delivered: targetRows });
  }

  // ---------- PHASE C: TELEMETRY — poll active spokes, record latency & status ----------
  if (action === "health_poll") {
    const { data: apps } = await supabase
      .from("vos_suite_apps")
      .select("app_key, name, url, bridge_secret_slot, is_active, role")
      .eq("is_active", true)
      .eq("role", "spoke");

    const rows = await Promise.all((apps ?? []).map(async (app) => {
      const t0 = Date.now();
      const body = { kind: "ping", ts: t0 };
      const secret = Deno.env.get(app.bridge_secret_slot);
      if (!secret) {
        return { app_key: app.app_key, ok: false, http_status: null, latency_ms: null, error: "missing_secret", detail: {} };
      }
      const bodyStr = JSON.stringify(body);
      const ts = Math.floor(t0 / 1000).toString();
      const nonce = crypto.randomUUID();
      const sig = await hmacSha256Hex(secret, `${ts}.${nonce}.${app.app_key}.${bodyStr}`);
      const target = new URL("/functions/v1/suite-bridge-spoke", app.url).toString();
      try {
        const resp = await fetch(target, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-bridge-app": "vantoos",
            "x-bridge-timestamp": ts,
            "x-bridge-nonce": nonce,
            "x-bridge-signature": sig,
          },
          body: bodyStr,
        });
        const latency = Date.now() - t0;
        const ok = resp.status >= 200 && resp.status < 300;
        return {
          app_key: app.app_key, ok, http_status: resp.status,
          latency_ms: latency, error: ok ? null : `status_${resp.status}`,
          detail: { target },
        };
      } catch (e) {
        return {
          app_key: app.app_key, ok: false, http_status: null,
          latency_ms: Date.now() - t0, error: "unreachable",
          detail: { target, message: String(e) },
        };
      }
    }));

    if (rows.length > 0) {
      await supabase.from("vos_suite_telemetry").insert(rows).then(() => {}, () => {});
    }
    return json({ ok: true, probed: rows });
  }

  // ---------- INBOUND: verify signed snapshot/pong from spoke ----------
  if (action === "receive") {
    const app_key = req.headers.get("x-bridge-app") ?? "";
    const ts = req.headers.get("x-bridge-timestamp") ?? "";
    const nonce = req.headers.get("x-bridge-nonce") ?? "";
    const sig = req.headers.get("x-bridge-signature") ?? "";
    const bodyStr = JSON.stringify(payload?.body ?? {});

    if (!app_key || !ts || !nonce || !sig) return json({ error: "missing_signature_headers" }, 400);
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > SIG_WINDOW_SECONDS) {
      return json({ error: "stale_timestamp" }, 400);
    }

    const { data: app } = await supabase
      .from("vos_suite_apps").select("bridge_secret_slot, is_active")
      .eq("app_key", app_key).maybeSingle();
    if (!app || !app.is_active) return json({ error: "unknown_or_inactive_app" }, 401);

    const secret = Deno.env.get(app.bridge_secret_slot);
    if (!secret) return json({ error: "missing_secret" }, 500);

    const expected = await hmacSha256Hex(secret, `${ts}.${nonce}.${app_key}.${bodyStr}`);
    if (!timingSafeEqual(sig, expected)) return json({ error: "bad_signature" }, 401);

    await supabase.from("vos_signed_inbox").insert({
      source_app: app_key,
      app_id: app_key,
      event_name: payload?.body?.kind ?? "snapshot",
      idempotency_key: nonce,
      dedupe_key: `${app_key}:${nonce}`,
      ts: Number(ts),
      signature: sig,
      signature_header: sig,
      signature_version: "v1",
      payload: payload?.body ?? {},
      processing_state: "verified",
    }).then(() => {}, () => {});

    // Strategy Engine routing: snapshot | proposal | status
    const bodyKind = payload?.body?.kind;
    let snapshotId: string | null = null;
    if (bodyKind === "snapshot" || bodyKind === "proposal" || bodyKind === "status") {
      const { data: snapRow } = await supabase.from("vos_strategy_snapshots").insert({
        directive_id: payload?.body?.directive_id ?? null,
        app_key,
        kind: bodyKind,
        payload: payload?.body ?? {},
        signature: sig,
        nonce,
        verified: true,
      }).select("id").maybeSingle();
      snapshotId = snapRow?.id ?? null;
    }

    // Route proposals into the reviewable proposal queue
    if (bodyKind === "proposal") {
      await supabase.from("vos_strategy_proposals").insert({
        snapshot_id: snapshotId,
        directive_id: payload?.body?.directive_id ?? null,
        app_key,
        summary: payload?.body?.summary ?? payload?.body?.title ?? "Spoke proposal",
        detail: payload?.body ?? {},
        review_state: "pending",
      }).then(() => {}, () => {});

      // Mark the target row as responded, if we can locate it
      if (payload?.body?.directive_id) {
        await supabase.from("vos_strategy_targets")
          .update({ delivery_status: "responded" })
          .eq("directive_id", payload.body.directive_id)
          .eq("app_key", app_key)
          .then(() => {}, () => {});
      }
    }

    // Spec Kit v1 contacts_upsert delivered via /receive → materialize into hub_contacts
    if (bodyKind === "contacts_upsert" && Array.isArray(payload?.body?.contacts)) {
      const { data: appRow } = await supabase
        .from("vos_suite_apps").select("allowed_contact_types")
        .eq("app_key", app_key).maybeSingle();
      const allowed: string[] = (appRow as any)?.allowed_contact_types ?? [];
      const defaultType = allowed.includes("email_marketing") ? "email_marketing"
                        : allowed.includes("mlm") ? "mlm"
                        : allowed[0] ?? "mixed";

      let enriched = 0, created = 0;
      for (const c of payload.body.contacts as any[]) {
        const remote_id = String(c?.local_id ?? "");
        const full_name = String(c?.identity?.name ?? "").trim();
        const email = c?.identity?.email ? String(c.identity.email).trim().toLowerCase() : null;
        const phone_e164 = c?.identity?.phone_normalized ? String(c.identity.phone_normalized).trim() : null;
        if (!remote_id || !full_name || (!email && !phone_e164)) continue;

        let hubId: string | null = null;
        const { data: link } = await supabase.from("hub_contact_links")
          .select("hub_contact_id").eq("app_key", app_key).eq("remote_id", remote_id).maybeSingle();
        if (link) hubId = link.hub_contact_id;
        if (!hubId && email) {
          const { data: byE } = await supabase.from("hub_contacts")
            .select("id").eq("email", email).eq("is_deleted", false).maybeSingle();
          if (byE) hubId = byE.id;
        }
        if (!hubId && phone_e164) {
          const { data: byP } = await supabase.from("hub_contacts")
            .select("id").eq("phone_e164", phone_e164).eq("is_deleted", false).maybeSingle();
          if (byP) hubId = byP.id;
        }

        const unsubscribed = !!c?.attributes?.unsubscribed;
        const patch: Record<string, unknown> = {
          full_name,
          first_name: c?.identity?.first_name ?? null,
          last_name: c?.identity?.last_name ?? null,
          whatsapp_display_name: c?.identity?.whatsapp_display_name ?? null,
          lead_type: c?.attributes?.lead_type ?? null,
          notes: c?.attributes?.notes ?? null,
          unsubscribed_channels: unsubscribed ? ["email"] : [],
          consent_email: !unsubscribed,
          last_synced_at: new Date().toISOString(),
        };
        if (email) patch.email = email;
        if (phone_e164) patch.phone_e164 = phone_e164;

        if (hubId) {
          await supabase.from("hub_contacts").update(patch).eq("id", hubId);
          enriched++;
        } else {
          const { data: ins } = await supabase.from("hub_contacts").insert({
            ...patch, contact_type: defaultType, source_app: app_key, source_id: remote_id, version: 1,
          }).select("id").maybeSingle();
          hubId = ins?.id ?? null;
          if (hubId) created++;
        }
        if (hubId) {
          await supabase.from("hub_contact_links").upsert({
            hub_contact_id: hubId, app_key, remote_id, last_pushed_at: new Date().toISOString(),
          }, { onConflict: "hub_contact_id,app_key" });
        }
      }
      return json({ ok: true, verified: true, materialized: { enriched, created } });
    }

    return json({ ok: true, verified: true, snapshot_id: snapshotId });
  }

  // ---------- UNIFIED CONTACTS HUB (Phase G) ----------
  // Actions: contacts_upsert | contacts_pull | contacts_delete
  // All three require an HMAC signature from a registered spoke, exactly like `receive`.
  if (action === "contacts_upsert" || action === "contacts_pull" || action === "contacts_delete") {
    const app_key = req.headers.get("x-bridge-app") ?? "";
    const ts = req.headers.get("x-bridge-timestamp") ?? "";
    const nonce = req.headers.get("x-bridge-nonce") ?? "";
    const sig = req.headers.get("x-bridge-signature") ?? "";
    const bodyStr = JSON.stringify(payload?.body ?? {});

    if (!app_key || !ts || !nonce || !sig) return json({ error: "missing_signature_headers" }, 400);
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > SIG_WINDOW_SECONDS) {
      return json({ error: "stale_timestamp" }, 400);
    }

    const { data: app } = await supabase
      .from("vos_suite_apps")
      .select("app_key, bridge_secret_slot, is_active, allowed_contact_types")
      .eq("app_key", app_key).maybeSingle();
    if (!app || !app.is_active) return json({ error: "unknown_or_inactive_app" }, 401);

    const secret = Deno.env.get(app.bridge_secret_slot);
    if (!secret) return json({ error: "missing_secret" }, 500);

    const expected = await hmacSha256Hex(secret, `${ts}.${nonce}.${app_key}.${bodyStr}`);
    if (!timingSafeEqual(sig, expected)) return json({ error: "bad_signature" }, 401);

    const allowed: string[] = (app as any).allowed_contact_types ?? [];
    const body: any = payload?.body ?? {};

    // ----- contacts_upsert -----
    if (action === "contacts_upsert") {
      const records = Array.isArray(body?.records) ? body.records : [];
      if (records.length === 0) return json({ error: "no_records" }, 400);
      if (records.length > 500) return json({ error: "batch_too_large" }, 400);

      const results: any[] = [];
      for (const r of records) {
        const remote_id = String(r?.remote_id ?? "");
        const full_name = String(r?.full_name ?? "").trim();
        const phone_e164 = r?.phone_e164 ? String(r.phone_e164).trim() : null;
        const email = r?.email ? String(r.email).trim().toLowerCase() : null;
        const contact_type = String(r?.contact_type ?? "");
        if (!remote_id || !full_name || !contact_type) {
          results.push({ remote_id, action: "invalid", error: "missing_required_fields" });
          continue;
        }
        if (!["mlm", "email_marketing", "personal", "mixed"].includes(contact_type)) {
          results.push({ remote_id, action: "invalid", error: "bad_contact_type" });
          continue;
        }
        // Hub-side gating: spoke may only push types it's allowed to own.
        if (allowed.length > 0 && !allowed.includes(contact_type)) {
          results.push({ remote_id, action: "rejected", error: "contact_type_not_allowed_for_spoke" });
          continue;
        }
        if (!phone_e164 && !email) {
          results.push({ remote_id, action: "invalid", error: "need_phone_or_email" });
          continue;
        }

        // Match: existing link -> phone -> email
        let hubId: string | null = null;
        const { data: existingLink } = await supabase
          .from("hub_contact_links").select("hub_contact_id")
          .eq("app_key", app_key).eq("remote_id", remote_id).maybeSingle();
        if (existingLink) hubId = existingLink.hub_contact_id;

        if (!hubId && phone_e164) {
          const { data: byPhone } = await supabase
            .from("hub_contacts").select("id")
            .eq("phone_e164", phone_e164).eq("is_deleted", false).maybeSingle();
          if (byPhone) hubId = byPhone.id;
        }
        if (!hubId && email) {
          const { data: byEmail } = await supabase
            .from("hub_contacts").select("id")
            .eq("email", email).eq("is_deleted", false).maybeSingle();
          if (byEmail) hubId = byEmail.id;
        }

        const incomingVersion = Number.isFinite(r?.version) ? Number(r.version) : 1;
        let actionTag: "created" | "updated" | "conflict" = "created";

        if (hubId) {
          const { data: cur } = await supabase
            .from("hub_contacts").select("version").eq("id", hubId).maybeSingle();
          if (cur && incomingVersion < cur.version) {
            const { data: full } = await supabase
              .from("hub_contacts").select("*").eq("id", hubId).maybeSingle();
            results.push({ remote_id, hub_contact_id: hubId, action: "conflict", current: full });
            continue;
          }
          const patch: Record<string, unknown> = {
            full_name,
            contact_type,
            version: Math.max(incomingVersion, (cur?.version ?? 1)) + 1,
            last_synced_at: new Date().toISOString(),
          };
          if (phone_e164) patch.phone_e164 = phone_e164;
          if (email) patch.email = email;
          if (Array.isArray(r?.tags)) patch.tags = r.tags;
          if (typeof r?.consent_whatsapp === "boolean") patch.consent_whatsapp = r.consent_whatsapp;
          if (typeof r?.consent_email === "boolean") patch.consent_email = r.consent_email;
          if (typeof r?.consent_sms === "boolean") patch.consent_sms = r.consent_sms;
          if (Array.isArray(r?.unsubscribed_channels)) patch.unsubscribed_channels = r.unsubscribed_channels;
          await supabase.from("hub_contacts").update(patch).eq("id", hubId);
          actionTag = "updated";
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from("hub_contacts").insert({
              full_name, phone_e164, email, contact_type,
              tags: Array.isArray(r?.tags) ? r.tags : [],
              consent_whatsapp: !!r?.consent_whatsapp,
              consent_email: !!r?.consent_email,
              consent_sms: !!r?.consent_sms,
              unsubscribed_channels: Array.isArray(r?.unsubscribed_channels) ? r.unsubscribed_channels : [],
              source_app: app_key,
              source_id: remote_id,
              version: incomingVersion,
              last_synced_at: new Date().toISOString(),
            }).select("id").maybeSingle();
          if (insErr || !inserted) {
            results.push({ remote_id, action: "error", error: insErr?.message ?? "insert_failed" });
            continue;
          }
          hubId = inserted.id;
          actionTag = "created";
        }

        await supabase.from("hub_contact_links").upsert({
          hub_contact_id: hubId,
          app_key,
          remote_id,
          last_pushed_at: new Date().toISOString(),
        }, { onConflict: "hub_contact_id,app_key" });

        results.push({ remote_id, hub_contact_id: hubId, action: actionTag });
      }
      return json({ ok: true, results });
    }

    // ----- contacts_pull -----
    if (action === "contacts_pull") {
      const since = body?.since ? new Date(body.since).toISOString() : new Date(0).toISOString();
      const limit = Math.min(Math.max(Number(body?.limit ?? 500), 1), 1000);
      const requested: string[] = Array.isArray(body?.types) ? body.types : allowed;
      const types = allowed.length > 0 ? requested.filter((t) => allowed.includes(t)) : requested;
      if (types.length === 0) return json({ ok: true, records: [], next_since: since });

      let q = supabase.from("hub_contacts")
        .select("id, full_name, phone_e164, email, contact_type, tags, consent_whatsapp, consent_email, consent_sms, unsubscribed_channels, version, updated_at, is_deleted")
        .gt("updated_at", since)
        .in("contact_type", types)
        .order("updated_at", { ascending: true })
        .limit(limit);
      if (allowed.length === 1 && allowed[0] === "email_marketing") {
        q = q.not("email", "is", null);
      }
      const { data: records, error } = await q;
      if (error) return json({ error: "pull_failed", detail: error.message }, 500);

      const next_since = records && records.length > 0
        ? records[records.length - 1].updated_at
        : since;

      if (records && records.length > 0) {
        const ids = records.map((r) => r.id);
        await supabase.from("hub_contact_links")
          .update({ last_pulled_at: new Date().toISOString() })
          .eq("app_key", app_key)
          .in("hub_contact_id", ids);
      }

      return json({ ok: true, records: records ?? [], next_since });
    }

    // ----- contacts_delete (soft) -----
    if (action === "contacts_delete") {
      const remote_id = String(body?.remote_id ?? "");
      const reason = body?.reason ? String(body.reason) : null;
      if (!remote_id) return json({ error: "missing_remote_id" }, 400);
      const { data: link } = await supabase
        .from("hub_contact_links").select("hub_contact_id")
        .eq("app_key", app_key).eq("remote_id", remote_id).maybeSingle();
      if (!link) return json({ ok: true, action: "not_found" });
      await supabase.from("hub_contacts")
        .update({ is_deleted: true, last_synced_at: new Date().toISOString() })
        .eq("id", link.hub_contact_id);
      return json({ ok: true, action: "soft_deleted", hub_contact_id: link.hub_contact_id, reason });
    }
  }

  // ---------- HUB → SPOKE SEED (Phase G.A) ----------
  // Admin-initiated bulk push. Walks hub_contacts and delivers signed
  // contacts_upsert batches straight to a target spoke — independent of
  // whether the spoke's pull loop is implemented.
  if (action === "contacts_seed_spoke") {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "auth_required" }, 401);
    }
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userRes } = await authed.auth.getUser();
    const user = userRes?.user;
    if (!user) return json({ error: "auth_required" }, 401);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "admin_only" }, 403);

    const target_app_key = String(payload?.app_key ?? "");
    if (!target_app_key) return json({ error: "missing_app_key" }, 400);
    const batchSize = Math.min(Math.max(Number(payload?.batch_size ?? 200), 1), 500);
    const maxBatches = Math.min(Math.max(Number(payload?.max_batches ?? 20), 1), 100);
    const sinceRaw = payload?.since ? new Date(payload.since).toISOString() : null;

    const { data: targetApp } = await supabase
      .from("vos_suite_apps")
      .select("app_key, allowed_contact_types, is_active, role")
      .eq("app_key", target_app_key).maybeSingle();
    if (!targetApp || !targetApp.is_active || targetApp.role !== "spoke") {
      return json({ error: "unknown_or_inactive_spoke" }, 400);
    }
    const allowedTypes: string[] = (targetApp as any).allowed_contact_types ?? [];

    let cursor = sinceRaw ?? new Date(0).toISOString();
    let totalScanned = 0;
    let totalSent = 0;
    let totalDelivered = 0;
    let totalFailed = 0;
    const batchResults: any[] = [];

    for (let i = 0; i < maxBatches; i++) {
      let q = supabase.from("hub_contacts")
        .select("id, full_name, phone_e164, email, contact_type, tags, consent_whatsapp, consent_email, consent_sms, unsubscribed_channels, version, updated_at, is_deleted")
        .gt("updated_at", cursor)
        .eq("is_deleted", false)
        .order("updated_at", { ascending: true })
        .limit(batchSize);
      if (allowedTypes.length > 0) q = q.in("contact_type", allowedTypes);
      const { data: rows, error: pullErr } = await q;
      if (pullErr) return json({ error: "hub_read_failed", detail: pullErr.message }, 500);
      if (!rows || rows.length === 0) break;

      totalScanned += rows.length;
      const records = rows
        .filter((r) => r.email || r.phone_e164)
        .map((r) => ({
          remote_id: r.id,
          full_name: r.full_name,
          phone_e164: r.phone_e164,
          email: r.email,
          contact_type: r.contact_type,
          tags: r.tags ?? [],
          consent_whatsapp: !!r.consent_whatsapp,
          consent_email: !!r.consent_email,
          consent_sms: !!r.consent_sms,
          unsubscribed_channels: r.unsubscribed_channels ?? [],
          version: r.version ?? 1,
        }));

      cursor = rows[rows.length - 1].updated_at;

      if (records.length === 0) continue;

      const body = { kind: "contacts_upsert", records };
      const res = await deliverToSpoke(target_app_key, body);
      totalSent += records.length;
      const ok = res.ok === true;
      if (ok) totalDelivered += records.length; else totalFailed += records.length;
      batchResults.push({
        batch: i + 1,
        sent: records.length,
        status: res.status ?? 0,
        ok,
        error: ok ? null : ((res as any).error ?? (res as any).body?.error ?? null),
      });

      await supabase.from("vos_outbound_log").insert({
        target_app: target_app_key,
        event_name: "contacts_upsert",
        idempotency_key: (res as any).nonce ?? crypto.randomUUID(),
        outcome: ok ? "delivered" : "failed",
        detail: { seed: true, batch: i + 1, count: records.length, spoke_status: res.status ?? 0 },
      }).then(() => {}, () => {});

      if (!ok) break; // stop on first failure so we don't hammer a broken spoke
    }

    return json({
      ok: totalFailed === 0,
      app_key: target_app_key,
      scanned: totalScanned,
      sent: totalSent,
      delivered: totalDelivered,
      failed: totalFailed,
      next_since: cursor,
      batches: batchResults,
    });
  }

  return json({ error: "unknown_action", action }, 400);
});
