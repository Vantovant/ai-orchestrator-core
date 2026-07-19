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
    const secret = Deno.env.get(app.bridge_secret_slot);
    if (!secret) return { ok: false, error: "missing_secret", status: 500, nonce: null };

    const bodyStr = JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000).toString();
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
    if (bodyKind === "snapshot" || bodyKind === "proposal" || bodyKind === "status") {
      await supabase.from("vos_strategy_snapshots").insert({
        directive_id: payload?.body?.directive_id ?? null,
        app_key,
        kind: bodyKind,
        payload: payload?.body ?? {},
        signature: sig,
        nonce,
        verified: true,
      }).then(() => {}, () => {});
    }

    return json({ ok: true, verified: true });
  }

  return json({ error: "unknown_action", action }, 400);
});
