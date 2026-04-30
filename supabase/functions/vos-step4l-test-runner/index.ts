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
  const { data: userData, error } = await sb.auth.getUser(token);
  const userId = userData?.user?.id;
  if (error || !userId) return { ok: false, status: 401, reason: "invalid_token" };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").limit(1);
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

  // ─── Strict pass/fail assertions ──────────────────────────────────────────
  const findRes = (name: string) => results.find((r) => r.test === name);
  const a = findRes("A_axis_b_disabled");
  const b = findRes("B_valid_persists");
  const c = findRes("C_duplicate_deduped");
  const d = findRes("D_bad_signature");
  const e = findRes("E_wrong_event");

  const assertions = {
    A_rejected_flag: a?.status === 403 && a?.body?.reason === "axis_b_disabled",
    B_persisted: b?.status === 200 && b?.body?.persisted === true && b?.body?.deduped === false,
    C_deduped: c?.status === 200 && c?.body?.deduped === true && c?.body?.persisted === false,
    D_rejected_signature: d?.status === 401 && d?.body?.signature_valid === false,
    E_rejected_event: e?.status === 400 && (e?.body?.reason === "event_name_not_allowed" || e?.body?.event_allowed === false),
    delta_inbox_is_one: (finalInbox - baseInbox) === 1,
    delta_audit_at_least_5: (finalAudit - baseAudit) >= 5,
    F_axis_b_restored:
      finalFlags?.find((f: any) => f.flag_key === "VOS_INBOX_RECEIVE_ENABLED")?.flag_value === "false"
      && finalFlags?.find((f: any) => f.flag_key === "VOS_INBOX_RECEIVE_APP_APLGO_ENABLED")?.flag_value === "false"
      && (finalKs ?? []).some((k: any) => k.scope === "inbox_receive" && k.scope_target === APP_ID && k.state === "engaged"),
    axis_a_still_red:
      finalFlags?.find((f: any) => f.flag_key === "VANTO_OS_ENABLED")?.flag_value === "false"
      && finalFlags?.find((f: any) => f.flag_key === "EMAIL_SEND_ENABLED")?.flag_value === "false"
      && finalFlags?.find((f: any) => f.flag_key === "WHATSAPP_SEND_ENABLED")?.flag_value === "false"
      && finalFlags?.find((f: any) => f.flag_key === "MASTER_PROSPECTOR_STATE")?.flag_value === "ASLEEP"
      && finalFlags?.find((f: any) => f.flag_key === "PHASE_4A_STEP_3")?.flag_value === "OFF",
  };
  const allPassed = Object.values(assertions).every(Boolean);
  const passedCount = Object.values(assertions).filter(Boolean).length;
  const totalCount = Object.keys(assertions).length;

  return new Response(JSON.stringify({
    ok: allPassed,
    verdict: allPassed
      ? "STEP 4L BUILD COMPLETE — LEVEL 2 INBOX RECEIVE VERIFIED, AXIS A STILL RED"
      : "STEP 4L PARTIAL — VALID PACKET STILL NOT PERSISTING",
    notice: "Step 4L test runner complete. Axis B returned to default (OFF + engaged).",
    summary: { passed: passedCount, total: totalCount, all_passed: allPassed },
    assertions,
    baseline: { inbox_rows_before: baseInbox, audit_rows_before: baseAudit },
    final: { inbox_rows_after: finalInbox, audit_rows_after: finalAudit, delta_inbox: finalInbox - baseInbox, delta_audit: finalAudit - baseAudit },
    results,
    final_axis_b_state: { flags: finalFlags, kill_switches: (finalKs ?? []).filter((k: any) => k.scope === "inbox_receive" || k.scope_target === "*") },
    final_axis_a_state: {
      vanto_os_enabled: finalFlags?.find((f: any) => f.flag_key === "VANTO_OS_ENABLED")?.flag_value,
      email_send_enabled: finalFlags?.find((f: any) => f.flag_key === "EMAIL_SEND_ENABLED")?.flag_value,
      whatsapp_send_enabled: finalFlags?.find((f: any) => f.flag_key === "WHATSAPP_SEND_ENABLED")?.flag_value,
      master_prospector_state: finalFlags?.find((f: any) => f.flag_key === "MASTER_PROSPECTOR_STATE")?.flag_value,
      phase_4a_step_3: finalFlags?.find((f: any) => f.flag_key === "PHASE_4A_STEP_3")?.flag_value,
      global_kill_switch: (finalKs ?? []).find((k: any) => k.scope === "global" && k.scope_target === "*")?.state,
      app_kill_switch: (finalKs ?? []).find((k: any) => k.scope === "app" && k.scope_target === APP_ID)?.state,
    },
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
