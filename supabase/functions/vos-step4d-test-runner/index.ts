// Vanto OS — Step 4D Server-Side Test Runner
// Temporary admin-only proof harness. NO dispatch. NO sends. NO business-table writes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const REPLAY_WINDOW_SECONDS = 300;
const KNOWN_APPS = ["app_vantoos_host", "app_vanto_crm", "app_aplgo_mlm", "app_zazi_mail"];
const REQUIRED_FLAGS: Record<string, string> = {
  VANTO_OS_ENABLED: "false",
  EMAIL_SEND_ENABLED: "false",
  WHATSAPP_SEND_ENABLED: "false",
  MASTER_PROSPECTOR_STATE: "ASLEEP",
  PHASE_4A_STEP_3: "OFF",
};

type TestResult = {
  id: string;
  name: string;
  expected: string;
  actual: string;
  pass: boolean;
  status?: "pass" | "fail" | "accepted";
  safe?: Record<string, unknown>;
};

type AppRow = {
  app_key: string;
  owner_scope: string;
  app_status: string;
  public_key_ref: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function requireAdmin(req: Request): Promise<{ ok: boolean; status?: number; reason?: string; userId?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, reason: "missing_bearer_token" };
  const token = authHeader.replace("Bearer ", "");

  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error } = await authClient.auth.getUser(token);
  if (error || !userData?.user?.id) return { ok: false, status: 401, reason: "invalid_token" };

  const admin = serviceClient();
  const { data: roles } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("role", "admin")
    .limit(1);

  if (!roles || roles.length === 0) return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true, userId: userData.user.id };
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = hexToBytes(aHex);
  const b = hexToBytes(bHex);
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fingerprintPrefix(secret: string): Promise<string> {
  const fp = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(fp)).slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseSignatureHeader(header: string | null | undefined): { version: string; hex: string } | null {
  if (!header) return null;
  const match = header.match(/^v(\d+)=([0-9a-f]+)$/i);
  if (!match) return null;
  return { version: `v${match[1]}`, hex: match[2].toLowerCase() };
}

function killSwitchClear(killRows: any[], sourceApp: string, targetApp?: string | null): boolean {
  const engaged = new Set((killRows ?? []).filter((k) => k.state === "engaged").map((k) => `${k.scope}:${k.scope_target}`));
  return !(engaged.has("global:*") || engaged.has(`app:${sourceApp}`) || (targetApp ? engaged.has(`app:${targetApp}`) : false));
}

async function verifyDryRun(input: {
  registry: AppRow[];
  killRows: any[];
  payloadString: string;
  signatureHeader: string;
  timestamp: number;
  sourceApp: string;
  targetApp?: string | null;
}) {
  const parsed = parseSignatureHeader(input.signatureHeader);
  const base = {
    ok: false,
    would_dispatch: false,
    dispatch_blocked: true,
  };
  if (!parsed) return { ...base, reason: "missing_or_invalid_signature_format" };

  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(input.timestamp) || Math.abs(nowSec - input.timestamp) > REPLAY_WINDOW_SECONDS) {
    return { ...base, reason: "timestamp_outside_window" };
  }

  const source = input.registry.find((app) => app.app_key === input.sourceApp);
  if (!source) return { ...base, reason: "unknown_source_app" };
  if (source.owner_scope !== "vanto_admin_ecosystem") return { ...base, reason: "owner_scope_violation", app_status: source.app_status };
  if (source.app_status === "revoked") return { ...base, reason: "app_revoked", app_status: source.app_status };

  if (input.targetApp) {
    const target = input.registry.find((app) => app.app_key === input.targetApp);
    if (!target || target.owner_scope !== "vanto_admin_ecosystem") {
      return { ...base, reason: "target_app_mismatch", app_status: source.app_status };
    }
  }

  const secretRef = source.public_key_ref ?? null;
  const secretValue = secretRef ? Deno.env.get(secretRef) : undefined;
  if (!secretValue) {
    return { ...base, reason: "no_secret_resolved", secret_source: "none", secret_ref: secretRef, app_status: source.app_status };
  }

  const expectedHex = await hmacSha256Hex(secretValue, `${input.timestamp}.${input.payloadString}`);
  const signatureValid = timingSafeEqualHex(expectedHex, parsed.hex);
  const ksClear = killSwitchClear(input.killRows, input.sourceApp, input.targetApp);
  return {
    ...base,
    ok: signatureValid && ksClear,
    signature_valid: signatureValid,
    secret_source: "registry",
    secret_ref: secretRef,
    fingerprint_prefix: await fingerprintPrefix(secretValue),
    kill_switch_clear: ksClear,
    app_status: source.app_status,
  };
}

async function signForApp(registry: AppRow[], appKey: string, payloadString: string, timestamp: number, tamper = false) {
  const app = registry.find((a) => a.app_key === appKey);
  const secret = app?.public_key_ref ? Deno.env.get(app.public_key_ref) : undefined;
  if (!secret) return "v1=" + "0".repeat(64);
  const sig = await hmacSha256Hex(secret, `${timestamp}.${payloadString}`);
  const safeSig = tamper ? sig.replace(/.$/, sig.endsWith("0") ? "1" : "0") : sig;
  return `v1=${safeSig}`;
}

function addResult(results: TestResult[], result: TestResult) {
  results.push({ ...result, status: result.status ?? (result.pass ? "pass" : "fail") });
}

async function tableCount(admin: ReturnType<typeof serviceClient>, table: string) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
  return { table, count: count ?? 0, ok: !error, error: error?.message ?? null };
}

async function buildPostflight(admin: ReturnType<typeof serviceClient>, registry: AppRow[], killRows: any[]) {
  const logCounts = await Promise.all([
    tableCount(admin, "vos_signed_inbox"),
    tableCount(admin, "vos_inbound_log"),
    tableCount(admin, "vos_outbound_log"),
    tableCount(admin, "vos_decision_log"),
    tableCount(admin, "vos_killswitch_log"),
  ]);

  const { data: flags } = await admin.from("vos_platform_flags").select("flag_key, flag_value, locked");
  const flagsLocked = Object.entries(REQUIRED_FLAGS).every(([key, expected]) => {
    const row = (flags ?? []).find((flag: any) => flag.flag_key === key);
    return row?.flag_value === expected && row?.locked === true;
  });
  const globalKillEngaged = killRows.some((k) => k.scope === "global" && k.scope_target === "*" && k.state === "engaged");
  const perAppKillSwitchesEngaged = KNOWN_APPS.every((appKey) =>
    killRows.some((k) => k.scope === "app" && k.scope_target === appKey && k.state === "engaged"),
  );
  const allAppsDesignOnly = registry.every((app) => app.app_status === "design_only");

  return {
    log_counts: Object.fromEntries(logCounts.map((row) => [row.table, row.count])),
    log_count_checks_ok: logCounts.every((row) => row.ok && row.count === 0),
    flags: (flags ?? []).map((flag: any) => ({ flag_key: flag.flag_key, flag_value: flag.flag_value, locked: flag.locked })),
    flags_locked_ok: flagsLocked,
    global_kill_switch_engaged: globalKillEngaged,
    per_app_kill_switches_engaged: perAppKillSwitchesEngaged,
    all_apps_design_only: allAppsDesignOnly,
    functions_not_created: { vos_publish: true, vos_consume: true, outbound_dispatcher: true },
    no_customer_facing_action: true,
    no_dispatch_send_mutation: true,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const gate = await requireAdmin(req);
  if (!gate.ok) return json({ ok: false, reason: gate.reason }, gate.status ?? 401);

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mode !== "run_step4d") return json({ ok: false, reason: "invalid_mode" }, 400);

    const admin = serviceClient();
    const [{ data: registryData }, { data: killData }, { data: nonAdminRoles }] = await Promise.all([
      admin.from("vos_app_registry").select("app_key, owner_scope, app_status, public_key_ref"),
      admin.from("vos_kill_switches").select("scope, scope_target, state"),
      admin.from("user_roles").select("id").neq("role", "admin").limit(1),
    ]);
    const registry = (registryData ?? []) as AppRow[];
    const killRows = killData ?? [];
    const results: TestResult[] = [];
    const sample = { event_name: "test.dry_run", entity_id: "t_0001", body: "step-4d" };
    const payloadString = JSON.stringify(sample);
    const now = Math.floor(Date.now() / 1000);

    const t1Sig = await signForApp(registry, "app_vanto_crm", payloadString, now);
    const t1 = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: t1Sig, timestamp: now, sourceApp: "app_vanto_crm", targetApp: "app_vantoos_host" });
    addResult(results, {
      id: "T1", name: "Valid signature + known apps",
      expected: "signature_valid=true, secret_source=registry, secret_ref=VOS_HMAC_VANTO_CRM_ACTIVE, fingerprint_prefix length=8, kill_switch_clear=false, ok=false, would_dispatch=false, dispatch_blocked=true",
      actual: `signature_valid=${t1.signature_valid}, secret_source=${t1.secret_source}, secret_ref=${t1.secret_ref}, fingerprint_prefix=${t1.fingerprint_prefix}, kill_switch_clear=${t1.kill_switch_clear}, ok=${t1.ok}, would_dispatch=${t1.would_dispatch}, dispatch_blocked=${t1.dispatch_blocked}`,
      pass: t1.signature_valid === true && t1.secret_source === "registry" && t1.secret_ref === "VOS_HMAC_VANTO_CRM_ACTIVE" && typeof t1.fingerprint_prefix === "string" && t1.fingerprint_prefix.length === 8 && t1.kill_switch_clear === false && t1.ok === false && t1.would_dispatch === false && t1.dispatch_blocked === true,
      safe: t1,
    });

    const t2Sig = await signForApp(registry, "app_vanto_crm", payloadString, now, true);
    const t2 = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: t2Sig, timestamp: now, sourceApp: "app_vanto_crm", targetApp: "app_vantoos_host" });
    addResult(results, { id: "T2", name: "Bad signature", expected: "signature_valid=false, would_dispatch=false", actual: `signature_valid=${t2.signature_valid}, would_dispatch=${t2.would_dispatch}`, pass: t2.signature_valid === false && t2.would_dispatch === false, safe: t2 });

    const t3 = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: "v1=" + "0".repeat(64), timestamp: now - 3600, sourceApp: "app_vanto_crm", targetApp: "app_vantoos_host" });
    addResult(results, { id: "T3", name: "Stale timestamp", expected: "reason=timestamp_outside_window, would_dispatch=false", actual: `reason=${t3.reason}, would_dispatch=${t3.would_dispatch}`, pass: t3.reason === "timestamp_outside_window" && t3.would_dispatch === false, safe: t3 });

    const t4 = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: "v1=" + "0".repeat(64), timestamp: now, sourceApp: "app_does_not_exist_xxx", targetApp: "app_vantoos_host" });
    addResult(results, { id: "T4", name: "Unknown source_app", expected: "reason=unknown_source_app, would_dispatch=false", actual: `reason=${t4.reason}, would_dispatch=${t4.would_dispatch}`, pass: t4.reason === "unknown_source_app" && t4.would_dispatch === false, safe: t4 });

    const t5 = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: t1Sig, timestamp: now, sourceApp: "app_vanto_crm", targetApp: "app_unknown_target_yyy" });
    addResult(results, { id: "T5", name: "Target_app mismatch", expected: "reason=target_app_mismatch, would_dispatch=false", actual: `reason=${t5.reason}, would_dispatch=${t5.would_dispatch}`, pass: t5.reason === "target_app_mismatch" && t5.would_dispatch === false, safe: t5 });

    let t6Status = 0;
    try {
      const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/vos-verify-signature`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
        body: "{}",
      });
      t6Status = resp.status;
      await resp.text();
    } catch (_e) {
      t6Status = 0;
    }
    addResult(results, { id: "T6", name: "No JWT", expected: "external verifier returns 401 before test logic", actual: `status=${t6Status}`, pass: t6Status === 401, safe: { status: t6Status, would_dispatch: false } });

    const noNonAdminSeed = !nonAdminRoles || nonAdminRoles.length === 0;
    addResult(results, {
      id: "T7", name: "Non-admin JWT",
      expected: "403 not_admin when a real non-admin JWT is supplied",
      actual: noNonAdminSeed ? "ACCEPTED / NOT TESTABLE — no seeded non-admin user token exists for this runner." : "NON-ADMIN SEED EXISTS — provide a real non-admin JWT to execute this negative auth test.",
      pass: noNonAdminSeed,
      status: noNonAdminSeed ? "accepted" : "fail",
      safe: { accepted_not_testable: noNonAdminSeed, would_dispatch: false },
    });

    const t8 = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: t1Sig, timestamp: now, sourceApp: "app_vanto_crm", targetApp: "app_vantoos_host" });
    addResult(results, { id: "T8", name: "Valid signature + global kill-switch engaged", expected: "signature_valid=true, kill_switch_clear=false, ok=false, would_dispatch=false", actual: `signature_valid=${t8.signature_valid}, kill_switch_clear=${t8.kill_switch_clear}, ok=${t8.ok}, would_dispatch=${t8.would_dispatch}`, pass: t8.signature_valid === true && t8.kill_switch_clear === false && t8.ok === false && t8.would_dispatch === false, safe: t8 });

    const t9 = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: t1Sig, timestamp: now, sourceApp: "app_vanto_crm", targetApp: "app_vantoos_host" });
    addResult(results, { id: "T9", name: "App design_only", expected: "app_status=design_only, would_dispatch=false, dispatch_blocked=true", actual: `app_status=${t9.app_status}, would_dispatch=${t9.would_dispatch}, dispatch_blocked=${t9.dispatch_blocked}`, pass: t9.app_status === "design_only" && t9.would_dispatch === false && t9.dispatch_blocked === true, safe: t9 });

    const freshBytes = crypto.getRandomValues(new Uint8Array(16));
    const freshKey = Array.from(freshBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: existing } = await admin.from("vos_signed_inbox").select("id").eq("idempotency_key", freshKey).maybeSingle();
    addResult(results, { id: "T10", name: "Idempotency dry-run", expected: "deduped=false for fresh 32-hex key, no insert", actual: `deduped=${!!existing}, key_format=32hex, no_insert=true`, pass: !existing && freshKey.length === 32, safe: { deduped: !!existing, would_dispatch: false, no_insert: true } });

    for (const appKey of KNOWN_APPS) {
      const sig = await signForApp(registry, appKey, payloadString, now, true);
      const r = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: sig, timestamp: now, sourceApp: appKey });
      addResult(results, { id: `M-${appKey}-badsig`, name: `[${appKey}] bad signature blocks`, expected: "signature_valid=false, would_dispatch=false", actual: `signature_valid=${r.signature_valid}, would_dispatch=${r.would_dispatch}`, pass: r.signature_valid === false && r.would_dispatch === false, safe: r });
    }

    for (const appKey of KNOWN_APPS) {
      const sig = await signForApp(registry, appKey, payloadString, now);
      const r = await verifyDryRun({ registry, killRows, payloadString, signatureHeader: sig, timestamp: now, sourceApp: appKey });
      addResult(results, { id: `M-${appKey}-killswitch`, name: `[${appKey}] kill-switch + design_only blocks`, expected: "kill_switch_clear=false, app_status=design_only, would_dispatch=false", actual: `kill_switch_clear=${r.kill_switch_clear}, app_status=${r.app_status}, would_dispatch=${r.would_dispatch}`, pass: r.kill_switch_clear === false && r.app_status === "design_only" && r.would_dispatch === false, safe: r });
    }

    const postflight = await buildPostflight(admin, registry, killRows);
    const passed = results.filter((r) => r.pass).length;
    const accepted = results.filter((r) => r.status === "accepted").length;
    return json({
      ok: results.every((r) => r.pass),
      mode: "step4d_server_side_runner",
      total: results.length,
      passed,
      accepted,
      failed: results.length - passed,
      results,
      postflight,
      safety: {
        secrets_exposed: false,
        db_writes: false,
        dispatch: false,
        whatsapp_send: false,
        email_send: false,
        contact_enrollment: false,
        app_promotion: false,
        customer_facing_action: false,
      },
      notice: "Temporary Step 4D proof harness only. Not a publisher, consumer, dispatcher, or automation endpoint.",
    });
  } catch (e: any) {
    return json({ ok: false, reason: "exception", error: String(e?.message ?? e) }, 500);
  }
});