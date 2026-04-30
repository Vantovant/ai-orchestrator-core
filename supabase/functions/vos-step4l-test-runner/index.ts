// Vanto OS — Step 4L Test Runner (admin-only)
// Server-side signs APLGO Level 2 packets and invokes vos-inbox-receive.
// Toggles Axis B flags + kill-switch around the test, then restores defaults.
// NO dispatch. NO send. NO consume.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_ID = "app_aplgo_mlm";
const EVENT = "aplgo.lead_magnet.downloaded";

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { ok: false, status: 401, reason: "missing_bearer_token" };
  const token = auth.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } });
  const { data: claims, error } = await sb.auth.getClaims(token);
  if (error || !claims?.claims?.sub) return { ok: false, status: 401, reason: "invalid_token" };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", claims.claims.sub).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true };
}

async function setFlag(admin: any, key: string, value: string) {
  // Bypass `locked` via service role
  await admin.from("vos_platform_flags").update({ flag_value: value, updated_at: new Date().toISOString() }).eq("flag_key", key);
}
async function setKillSwitch(admin: any, scope: string, target: string, state: "engaged" | "disengaged") {
  await admin.from("vos_kill_switches").update({ state, updated_at: new Date().toISOString() })
    .eq("scope", scope).eq("scope_target", target);
}

async function postPacket(opts: {
  payloadString: string;
  signatureHeader: string;
  ts: number;
  appId: string;
  event: string;
}) {
  const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/vos-inbox-receive`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vos-signature": opts.signatureHeader,
      "x-vos-timestamp": String(opts.ts),
      "x-vos-app-id": opts.appId,
      "x-vos-event": opts.event,
      // Pass anon key so the platform routes to the function (verify_jwt=false but apikey is required by gateway)
      "apikey": Deno.env.get("SUPABASE_ANON_KEY")!,
    },
    body: opts.payloadString,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) return new Response(JSON.stringify({ ok: false, reason: gate.reason }), { status: gate.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const secret = Deno.env.get("VOS_HMAC_APLGO_ACTIVE");
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, reason: "no_aplgo_secret" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Snapshot baseline counts
  const baseInbox = (await admin.from("vos_signed_inbox").select("*", { count: "exact", head: true }).eq("app_id", APP_ID)).count ?? 0;
  const baseAudit = (await admin.from("vos_inbox_receive_audit").select("*", { count: "exact", head: true })).count ?? 0;

  const results: any[] = [];

  // ───────────── TEST A — Axis B disabled (default) ─────────────
  {
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ name: "Test A", email: "a@example.com", ts });
    const sig = "v1=" + await hmacSha256Hex(secret, `${ts}.${payload}`);
    const r = await postPacket({ payloadString: payload, signatureHeader: sig, ts, appId: APP_ID, event: EVENT });
    results.push({ test: "A_axis_b_disabled", status: r.status, body: r.body });
  }

  // ───────────── Enable Axis B for tests ─────────────
  await setFlag(admin, "VOS_INBOX_RECEIVE_ENABLED", "true");
  await setFlag(admin, "VOS_INBOX_RECEIVE_APP_APLGO_ENABLED", "true");
  await setKillSwitch(admin, "inbox_receive", APP_ID, "disengaged");

  // ───────────── TEST B — valid signed packet persists ─────────────
  const tsB = Math.floor(Date.now() / 1000);
  const payloadB = JSON.stringify({ name: "Lead B", email: "leadb@example.com", phone: "+27 82 555 0100", ts: tsB });
  const sigB = "v1=" + await hmacSha256Hex(secret, `${tsB}.${payloadB}`);
  {
    const r = await postPacket({ payloadString: payloadB, signatureHeader: sigB, ts: tsB, appId: APP_ID, event: EVENT });
    results.push({ test: "B_valid_persists", status: r.status, body: r.body });
  }

  // ───────────── TEST C — duplicate same bytes ─────────────
  {
    const r = await postPacket({ payloadString: payloadB, signatureHeader: sigB, ts: tsB, appId: APP_ID, event: EVENT });
    results.push({ test: "C_duplicate_deduped", status: r.status, body: r.body });
  }

  // ───────────── TEST D — bad signature ─────────────
  {
    const tsD = Math.floor(Date.now() / 1000);
    const payloadD = JSON.stringify({ name: "Lead D", ts: tsD });
    const sigD = "v1=" + "0".repeat(64);
    const r = await postPacket({ payloadString: payloadD, signatureHeader: sigD, ts: tsD, appId: APP_ID, event: EVENT });
    results.push({ test: "D_bad_signature", status: r.status, body: r.body });
  }

  // ───────────── TEST E — wrong event ─────────────
  {
    const tsE = Math.floor(Date.now() / 1000);
    const payloadE = JSON.stringify({ name: "Lead E", ts: tsE });
    const sigE = "v1=" + await hmacSha256Hex(secret, `${tsE}.${payloadE}`);
    const r = await postPacket({ payloadString: payloadE, signatureHeader: sigE, ts: tsE, appId: APP_ID, event: "aplgo.something_else" });
    results.push({ test: "E_wrong_event", status: r.status, body: r.body });
  }

  // ───────────── TEST F — rollback ─────────────
  await setFlag(admin, "VOS_INBOX_RECEIVE_ENABLED", "false");
  await setFlag(admin, "VOS_INBOX_RECEIVE_APP_APLGO_ENABLED", "false");
  await setKillSwitch(admin, "inbox_receive", APP_ID, "engaged");

  // Postflight counts
  const finalInbox = (await admin.from("vos_signed_inbox").select("*", { count: "exact", head: true }).eq("app_id", APP_ID)).count ?? 0;
  const finalAudit = (await admin.from("vos_inbox_receive_audit").select("*", { count: "exact", head: true })).count ?? 0;

  // Re-read final flag/kill-switch state
  const { data: finalFlags } = await admin.from("vos_platform_flags").select("flag_key, flag_value, locked")
    .in("flag_key", ["VOS_INBOX_RECEIVE_ENABLED", "VOS_INBOX_RECEIVE_APP_APLGO_ENABLED", "VOS_ALLOWED_INBOX_EVENT", "VANTO_OS_ENABLED", "EMAIL_SEND_ENABLED", "WHATSAPP_SEND_ENABLED", "MASTER_PROSPECTOR_STATE", "PHASE_4A_STEP_3"]);
  const { data: finalKs } = await admin.from("vos_kill_switches").select("scope, scope_target, state");

  return new Response(JSON.stringify({
    ok: true,
    notice: "Step 4L test runner complete. Axis B returned to default (OFF + engaged).",
    baseline: { inbox_rows_before: baseInbox, audit_rows_before: baseAudit },
    final: { inbox_rows_after: finalInbox, audit_rows_after: finalAudit, delta_inbox: finalInbox - baseInbox, delta_audit: finalAudit - baseAudit },
    results,
    final_axis_b_state: { flags: finalFlags, kill_switches: finalKs?.filter((k: any) => k.scope === "inbox_receive" || k.scope_target === "*") },
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
