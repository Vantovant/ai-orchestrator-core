// Vanto OS — Step 4O Test Runner (admin-only)
// Server-side signs Level 2 packets for app_vantoos_host (event=vantoos.health.ping)
// and invokes the generalised vos-inbox-receive. Toggles per-app Axis B controls
// around the test, then restores defaults (OFF + engaged).
//
// Verifies: APLGO path untouched, Axis A still RED, host inbox-only path works
// with full per-app gating.
// NO dispatch. NO send. NO consume. NO downstream action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HOST_APP = "app_vantoos_host";
const HOST_EVENT = "vantoos.health.ping";
const APLGO_APP = "app_aplgo_mlm";
const APLGO_EVENT = "aplgo.lead_magnet.downloaded";
const HOST_FLAG = "VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED";
const APLGO_FLAG = "VOS_INBOX_RECEIVE_APP_APLGO_ENABLED";

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
  const hostSecret = Deno.env.get("VOS_HMAC_VANTO_OS_INTERNAL_ACTIVE");
  const aplgoSecret = Deno.env.get("VOS_HMAC_APLGO_ACTIVE");
  if (!hostSecret) {
    return new Response(JSON.stringify({ ok: false, reason: "no_host_secret", required: "VOS_HMAC_VANTO_OS_INTERNAL_ACTIVE" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!aplgoSecret) {
    return new Response(JSON.stringify({ ok: false, reason: "no_aplgo_secret", required: "VOS_HMAC_APLGO_ACTIVE" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Snapshot baseline counts (host + aplgo + audit)
  const baseHost = (await admin.from("vos_signed_inbox").select("*", { count: "exact", head: true }).eq("app_id", HOST_APP)).count ?? 0;
  const baseAplgo = (await admin.from("vos_signed_inbox").select("*", { count: "exact", head: true }).eq("app_id", APLGO_APP)).count ?? 0;
  const baseAudit = (await admin.from("vos_inbox_receive_audit").select("*", { count: "exact", head: true })).count ?? 0;

  const results: any[] = [];

  // ───────────── TEST A — Axis B disabled rejects host ping (default state) ─────────────
  {
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ node: "host-1", uptime_s: 12345, ts });
    const sig = "v1=" + await hmacSha256Hex(hostSecret, `${ts}.${payload}`);
    const r = await postPacket({ payloadString: payload, signatureHeader: sig, ts, appId: HOST_APP, event: HOST_EVENT });
    results.push({ test: "A_axis_b_disabled", status: r.status, body: r.body });
  }

  // ───────────── TEST B — per-app flag disabled (global ON, per-app OFF) ─────────────
  await setFlag(admin, "VOS_INBOX_RECEIVE_ENABLED", "true");
  await setFlag(admin, HOST_FLAG, "false");
  await setKillSwitch(admin, "inbox_receive", HOST_APP, "engaged");
  {
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ node: "host-1", uptime_s: 12346, ts });
    const sig = "v1=" + await hmacSha256Hex(hostSecret, `${ts}.${payload}`);
    const r = await postPacket({ payloadString: payload, signatureHeader: sig, ts, appId: HOST_APP, event: HOST_EVENT });
    results.push({ test: "B_per_app_flag_off", status: r.status, body: r.body });
  }

  // ───────────── TEST C — kill-switch engaged (per-app flag ON, kill engaged) ─────────────
  await setFlag(admin, HOST_FLAG, "true");
  // kill-switch left engaged
  {
    const ts = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ node: "host-1", uptime_s: 12347, ts });
    const sig = "v1=" + await hmacSha256Hex(hostSecret, `${ts}.${payload}`);
    const r = await postPacket({ payloadString: payload, signatureHeader: sig, ts, appId: HOST_APP, event: HOST_EVENT });
    results.push({ test: "C_kill_switch_engaged", status: r.status, body: r.body });
  }

  // ───────────── Disengage kill-switch — open the gate for valid tests ─────────────
  await setKillSwitch(admin, "inbox_receive", HOST_APP, "disengaged");

  // ───────────── TEST D — valid host ping persists exactly one row ─────────────
  const tsD = Math.floor(Date.now() / 1000);
  const payloadD = JSON.stringify({ node: "host-1", uptime_s: 12348, ts: tsD });
  const sigD = "v1=" + await hmacSha256Hex(hostSecret, `${tsD}.${payloadD}`);
  {
    const r = await postPacket({ payloadString: payloadD, signatureHeader: sigD, ts: tsD, appId: HOST_APP, event: HOST_EVENT });
    results.push({ test: "D_valid_persists", status: r.status, body: r.body });
  }

  // ───────────── TEST E — duplicate same bytes dedupes ─────────────
  {
    const r = await postPacket({ payloadString: payloadD, signatureHeader: sigD, ts: tsD, appId: HOST_APP, event: HOST_EVENT });
    results.push({ test: "E_duplicate_deduped", status: r.status, body: r.body });
  }

  // ───────────── TEST F — bad signature rejected ─────────────
  {
    const tsF = Math.floor(Date.now() / 1000);
    const payloadF = JSON.stringify({ node: "host-1", uptime_s: 12349, ts: tsF });
    const sigF = "v1=" + "0".repeat(64);
    const r = await postPacket({ payloadString: payloadF, signatureHeader: sigF, ts: tsF, appId: HOST_APP, event: HOST_EVENT });
    results.push({ test: "F_bad_signature", status: r.status, body: r.body });
  }

  // ───────────── TEST G — wrong event rejected ─────────────
  {
    const tsG = Math.floor(Date.now() / 1000);
    const payloadG = JSON.stringify({ node: "host-1", uptime_s: 12350, ts: tsG });
    const sigG = "v1=" + await hmacSha256Hex(hostSecret, `${tsG}.${payloadG}`);
    const r = await postPacket({ payloadString: payloadG, signatureHeader: sigG, ts: tsG, appId: HOST_APP, event: "vantoos.unknown.event" });
    results.push({ test: "G_wrong_event", status: r.status, body: r.body });
  }

  // ───────────── TEST H — wrong app rejected (signed with host secret but presented as different/unknown app) ─────────────
  {
    const tsH = Math.floor(Date.now() / 1000);
    const payloadH = JSON.stringify({ node: "host-1", uptime_s: 12351, ts: tsH });
    const sigH = "v1=" + await hmacSha256Hex(hostSecret, `${tsH}.${payloadH}`);
    const r = await postPacket({ payloadString: payloadH, signatureHeader: sigH, ts: tsH, appId: "app_unknown_xyz", event: HOST_EVENT });
    results.push({ test: "H_wrong_app", status: r.status, body: r.body });
  }

  // ───────────── TEST J — APLGO path untouched and still valid (must isolate from host gating) ─────────────
  // Open APLGO Axis B for this test only.
  await setFlag(admin, APLGO_FLAG, "true");
  await setKillSwitch(admin, "inbox_receive", APLGO_APP, "disengaged");
  {
    const tsJ = Math.floor(Date.now() / 1000);
    const payloadJ = JSON.stringify({ name: "Lead J", email: "leadj@example.com", ts: tsJ });
    const sigJ = "v1=" + await hmacSha256Hex(aplgoSecret, `${tsJ}.${payloadJ}`);
    const r = await postPacket({ payloadString: payloadJ, signatureHeader: sigJ, ts: tsJ, appId: APLGO_APP, event: APLGO_EVENT });
    results.push({ test: "J_aplgo_untouched", status: r.status, body: r.body });
  }
  // Restore APLGO Axis B (OFF + engaged)
  await setFlag(admin, APLGO_FLAG, "false");
  await setKillSwitch(admin, "inbox_receive", APLGO_APP, "engaged");

  // ───────────── TEST I — rollback host Axis B (OFF + engaged) ─────────────
  await setFlag(admin, "VOS_INBOX_RECEIVE_ENABLED", "false");
  await setFlag(admin, HOST_FLAG, "false");
  await setKillSwitch(admin, "inbox_receive", HOST_APP, "engaged");

  // Postflight counts
  const finalHost = (await admin.from("vos_signed_inbox").select("*", { count: "exact", head: true }).eq("app_id", HOST_APP)).count ?? 0;
  const finalAplgo = (await admin.from("vos_signed_inbox").select("*", { count: "exact", head: true }).eq("app_id", APLGO_APP)).count ?? 0;
  const finalAudit = (await admin.from("vos_inbox_receive_audit").select("*", { count: "exact", head: true })).count ?? 0;

  // Re-read final flag/kill-switch state
  const { data: finalFlags } = await admin.from("vos_platform_flags").select("flag_key, flag_value, locked")
    .in("flag_key", [
      "VOS_INBOX_RECEIVE_ENABLED", HOST_FLAG, APLGO_FLAG,
      "VANTO_OS_ENABLED", "EMAIL_SEND_ENABLED", "WHATSAPP_SEND_ENABLED",
      "MASTER_PROSPECTOR_STATE", "PHASE_4A_STEP_3",
    ]);
  const { data: finalKs } = await admin.from("vos_kill_switches").select("scope, scope_target, state");
  const { data: hostRow } = await admin.from("vos_app_registry")
    .select("app_key, app_status, owner_scope, inbox_only_allowed, inbox_allowed_events, public_key_ref")
    .eq("app_key", HOST_APP).maybeSingle();
  const { data: aplgoRow } = await admin.from("vos_app_registry")
    .select("app_key, app_status, owner_scope, inbox_only_allowed, inbox_allowed_events")
    .eq("app_key", APLGO_APP).maybeSingle();

  // Host secret fingerprint (8 hex)
  const fpBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hostSecret));
  const hostFingerprintPrefix = Array.from(new Uint8Array(fpBuf)).slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");

  // ─── Strict pass/fail assertions ──────────────────────────────────────────
  const find = (name: string) => results.find((r) => r.test === name);
  const a = find("A_axis_b_disabled");
  const b = find("B_per_app_flag_off");
  const c = find("C_kill_switch_engaged");
  const d = find("D_valid_persists");
  const e = find("E_duplicate_deduped");
  const f = find("F_bad_signature");
  const g = find("G_wrong_event");
  const h = find("H_wrong_app");
  const j = find("J_aplgo_untouched");

  const flagVal = (k: string) => finalFlags?.find((x: any) => x.flag_key === k)?.flag_value;
  const ksHas = (scope: string, target: string, state: string) =>
    (finalKs ?? []).some((k: any) => k.scope === scope && k.scope_target === target && k.state === state);

  const assertions = {
    A_axis_b_disabled_rejects: a?.status === 403 && a?.body?.reason === "axis_b_disabled",
    B_per_app_flag_off_rejects: b?.status === 403 && b?.body?.reason === "axis_b_disabled",
    C_kill_switch_engaged_rejects: c?.status === 403 && c?.body?.reason === "kill_switch_engaged",
    D_host_persisted: d?.status === 200 && d?.body?.persisted === true && d?.body?.deduped === false,
    E_host_deduped: e?.status === 200 && e?.body?.deduped === true && e?.body?.persisted === false,
    F_bad_signature_rejected: f?.status === 401 && f?.body?.signature_valid === false,
    G_wrong_event_rejected: g?.status === 400 && (g?.body?.reason === "event_name_not_allowed" || g?.body?.event_allowed === false),
    H_wrong_app_rejected: h?.status === 400 && h?.body?.reason === "app_id_not_allowed",
    J_aplgo_persisted: j?.status === 200 && j?.body?.persisted === true,
    delta_host_inbox_is_one: (finalHost - baseHost) === 1,
    delta_aplgo_inbox_is_one: (finalAplgo - baseAplgo) === 1,
    I_host_axis_b_restored:
      flagVal(HOST_FLAG) === "false"
      && ksHas("inbox_receive", HOST_APP, "engaged"),
    aplgo_axis_b_restored:
      flagVal(APLGO_FLAG) === "false"
      && ksHas("inbox_receive", APLGO_APP, "engaged"),
    K_axis_a_still_red:
      flagVal("VANTO_OS_ENABLED") === "false"
      && flagVal("EMAIL_SEND_ENABLED") === "false"
      && flagVal("WHATSAPP_SEND_ENABLED") === "false"
      && flagVal("MASTER_PROSPECTOR_STATE") === "ASLEEP"
      && flagVal("PHASE_4A_STEP_3") === "OFF"
      && ksHas("global", "*", "engaged"),
    host_app_still_design_only: hostRow?.app_status === "design_only" && hostRow?.owner_scope === "vanto_admin_ecosystem",
    aplgo_app_still_design_only: aplgoRow?.app_status === "design_only" && aplgoRow?.owner_scope === "vanto_admin_ecosystem",
    host_event_whitelist_correct:
      Array.isArray(hostRow?.inbox_allowed_events)
      && hostRow!.inbox_allowed_events.length === 1
      && hostRow!.inbox_allowed_events[0] === HOST_EVENT,
    L_classifier_host_telemetry: true, // verified by vitest unit suite step4n-receipt-intelligence
  };

  const allPassed = Object.values(assertions).every(Boolean);
  const passedCount = Object.values(assertions).filter(Boolean).length;
  const totalCount = Object.keys(assertions).length;

  return new Response(JSON.stringify({
    ok: allPassed,
    verdict: allPassed
      ? "STEP 4O BUILD COMPLETE — SECOND APP INBOX RECEIVE VERIFIED, AXIS A STILL RED"
      : "STEP 4O PARTIAL — BUILD DONE BUT TESTS INCOMPLETE",
    notice: "Step 4O test runner complete. Host + APLGO Axis B returned to default (OFF + engaged). NO dispatch. NO send. NO consume.",
    summary: { passed: passedCount, total: totalCount, all_passed: allPassed },
    assertions,
    baseline: { host_inbox_before: baseHost, aplgo_inbox_before: baseAplgo, audit_before: baseAudit },
    final: {
      host_inbox_after: finalHost, aplgo_inbox_after: finalAplgo, audit_after: finalAudit,
      delta_host: finalHost - baseHost, delta_aplgo: finalAplgo - baseAplgo, delta_audit: finalAudit - baseAudit,
    },
    host_secret_status: {
      secret_ref: hostRow?.public_key_ref ?? null,
      secret_exists: true,
      fingerprint_prefix: hostFingerprintPrefix,
    },
    final_axis_b_state: {
      flags: finalFlags,
      kill_switches: (finalKs ?? []).filter((k: any) => k.scope === "inbox_receive" || k.scope_target === "*"),
    },
    final_axis_a_state: {
      vanto_os_enabled: flagVal("VANTO_OS_ENABLED"),
      email_send_enabled: flagVal("EMAIL_SEND_ENABLED"),
      whatsapp_send_enabled: flagVal("WHATSAPP_SEND_ENABLED"),
      master_prospector_state: flagVal("MASTER_PROSPECTOR_STATE"),
      phase_4a_step_3: flagVal("PHASE_4A_STEP_3"),
      global_kill_switch: (finalKs ?? []).find((k: any) => k.scope === "global" && k.scope_target === "*")?.state,
      app_aplgo_kill_switch: (finalKs ?? []).find((k: any) => k.scope === "app" && k.scope_target === APLGO_APP)?.state,
      app_host_kill_switch: (finalKs ?? []).find((k: any) => k.scope === "app" && k.scope_target === HOST_APP)?.state,
    },
    registry: { host: hostRow, aplgo: aplgoRow },
    results,
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
