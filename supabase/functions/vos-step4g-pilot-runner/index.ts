// Vanto OS — Step 4G Pilot Runner (Host-Only NEXT Slot Dry-Run)
// Admin-only. Tests dual-accept (ACTIVE ∪ NEXT) for app_vantoos_host ONLY.
// NO dispatch. NO sends. NO business writes. NO promotion. NO PREVIOUS provisioning.
// Secrets are READ from Deno.env, used in-runtime, NEVER returned in responses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const PILOT_APP = "app_vantoos_host";
// Step 4K: slot refs are now resolved via vos_secret_slot_state, not hardcoded.
// These constants are fallbacks ONLY if the slot-state row is missing (should never happen post-seed).
const FALLBACK_ACTIVE_REF = "VOS_HMAC_VANTO_OS_INTERNAL_ACTIVE";
const FALLBACK_NEXT_REF = "VOS_HMAC_VANTO_OS_INTERNAL_NEXT";
const REPLAY_WINDOW_SECONDS = 300;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, reason: "missing_bearer_token" };
  const token = authHeader.replace("Bearer ", "");
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: u, error } = await authClient.auth.getUser(token);
  if (error || !u?.user?.id) return { ok: false, status: 401, reason: "invalid_token" };
  const admin = serviceClient();
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", u.user.id).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true, userId: u.user.id };
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function timingSafeEqualHex(a: string, b: string): boolean {
  const x = hexToBytes(a); const y = hexToBytes(b);
  if (!x || !y || x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function fingerprintPrefix(secret: string): Promise<string> {
  const fp = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(fp)).slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Slot = "active" | "next" | "previous";

type ResolvedSlot = { slot: Slot; ref: string };

/**
 * Dual-accept dry-run verifier for app_vantoos_host only.
 * Resolves slots through vos_secret_slot_state (Step 4K reference rails).
 * Tries ACTIVE first, then NEXT (NEXT only allowed in pilot mode).
 * Returns slot_used + secret_ref + fingerprint_prefix only.
 * Never returns secret values. would_dispatch is hard-coded false.
 */
async function dualAcceptVerify(opts: {
  payloadString: string;
  signatureHex: string;
  timestamp: number;
  killRows: any[];
  appStatus: string;
  resolvedSlots: ResolvedSlot[]; // ordered by attempt priority
}) {
  const base = { ok: false, would_dispatch: false, dispatch_blocked: true, app_status: opts.appStatus };
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(opts.timestamp) || Math.abs(nowSec - opts.timestamp) > REPLAY_WINDOW_SECONDS) {
    return { ...base, signature_valid: false, kill_switch_clear: false, slot_used: null as Slot | null, secret_ref: null, fingerprint_prefix: null, reason: "timestamp_outside_window" };
  }

  let slot_used: Slot | null = null;
  let matched_ref: string | null = null;
  let matched_fp: string | null = null;
  let signatureValid = false;
  const signed = `${opts.timestamp}.${opts.payloadString}`;

  for (const s of opts.resolvedSlots) {
    const value = Deno.env.get(s.ref);
    if (!value) continue;
    const expected = await hmacSha256Hex(value, signed);
    if (timingSafeEqualHex(expected, opts.signatureHex)) {
      signatureValid = true;
      slot_used = s.slot;
      matched_ref = s.ref;
      matched_fp = await fingerprintPrefix(value);
      break;
    }
  }

  const engaged = new Set((opts.killRows ?? []).filter((k) => k.state === "engaged").map((k) => `${k.scope}:${k.scope_target}`));
  const killBlocks = engaged.has("global:*") || engaged.has(`app:${PILOT_APP}`);
  const ksClear = !killBlocks;

  return {
    ...base,
    ok: signatureValid && ksClear,
    signature_valid: signatureValid,
    kill_switch_clear: ksClear,
    slot_used,
    secret_ref: matched_ref,
    fingerprint_prefix: matched_fp, // 8 hex chars only
    reason: signatureValid ? null : "signature_invalid",
  };
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const gate = await requireAdmin(req);
  if (!gate.ok) return json({ ok: false, reason: gate.reason }, gate.status ?? 401);

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mode !== "run_step4g") return json({ ok: false, reason: "invalid_mode" }, 400);

    const admin = serviceClient();

    // Registry lookup for app_vantoos_host (must be design_only)
    const { data: appRow } = await admin.from("vos_app_registry")
      .select("app_key, owner_scope, app_status, public_key_ref")
      .eq("app_key", PILOT_APP).maybeSingle();
    if (!appRow) return json({ ok: false, reason: "pilot_app_missing" }, 500);

    // Step 4K: resolve slot refs from vos_secret_slot_state (reference rails).
    // Falls back to legacy constants only if the row is missing (should never happen post-seed).
    const { data: slotRow } = await admin.from("vos_secret_slot_state")
      .select("active_secret_ref, next_secret_ref, previous_secret_ref, previous_grace_expires_at")
      .eq("app_key", PILOT_APP).maybeSingle();
    const ACTIVE_REF = slotRow?.active_secret_ref ?? FALLBACK_ACTIVE_REF;
    const NEXT_REF = slotRow?.next_secret_ref ?? FALLBACK_NEXT_REF;
    const PREVIOUS_REF = slotRow?.previous_secret_ref ?? null;
    const slot_state_resolved_from = slotRow ? "vos_secret_slot_state" : "fallback_constants";

    // Kill-switches (read-only)
    const { data: killRows } = await admin.from("vos_kill_switches").select("scope, scope_target, state");

    // Build resolved slot list for dual-accept (active first, then next).
    // PREVIOUS is verify-only and not used in pilot dual-accept attempts.
    const resolvedSlots: ResolvedSlot[] = [
      { slot: "active", ref: ACTIVE_REF },
      { slot: "next", ref: NEXT_REF },
    ];

    // Slot inventory — values NEVER returned, only presence + fingerprint
    const activeVal = Deno.env.get(ACTIVE_REF);
    const nextVal = Deno.env.get(NEXT_REF);
    const previousVal = PREVIOUS_REF ? Deno.env.get(PREVIOUS_REF) : undefined;
    const slot_inventory = {
      active: { secret_ref: ACTIVE_REF, present: !!activeVal, fingerprint_prefix: activeVal ? await fingerprintPrefix(activeVal) : null },
      next:   { secret_ref: NEXT_REF,   present: !!nextVal,   fingerprint_prefix: nextVal   ? await fingerprintPrefix(nextVal)   : null },
      previous: { secret_ref: PREVIOUS_REF, present: !!previousVal, fingerprint_prefix: null }, // never expose fp if unexpectedly present
    };


    const sample = { event_name: "step4g.host_dryrun", entity_id: "pilot_0001", body: "step-4g-host-only" };
    const payloadString = JSON.stringify(sample);
    const now = Math.floor(Date.now() / 1000);

    const results: any[] = [];

    // Test 1 — ACTIVE signature still verifies (slot_used=active)
    if (!activeVal) {
      results.push({ id: "P1", name: "ACTIVE verifies", pass: false, actual: "ACTIVE secret missing in env" });
    } else {
      const sig = await hmacSha256Hex(activeVal, `${now}.${payloadString}`);
      const r = await dualAcceptVerify({ payloadString, signatureHex: sig, timestamp: now, killRows: killRows ?? [], appStatus: appRow.app_status });
      results.push({
        id: "P1", name: "ACTIVE signature verifies via dual-accept",
        expected: "signature_valid=true, slot_used=active, would_dispatch=false, dispatch_blocked=true",
        actual: `signature_valid=${r.signature_valid}, slot_used=${r.slot_used}, would_dispatch=${r.would_dispatch}, dispatch_blocked=${r.dispatch_blocked}`,
        pass: r.signature_valid === true && r.slot_used === "active" && r.would_dispatch === false && r.dispatch_blocked === true,
        safe: { ...r, secret_value_returned: false },
      });
    }

    // Test 2 — NEXT signature verifies (slot_used=next, ref=NEXT, fp length=8)
    if (!nextVal) {
      results.push({ id: "P2", name: "NEXT verifies", pass: false, actual: "NEXT secret missing in env" });
    } else {
      const sig = await hmacSha256Hex(nextVal, `${now}.${payloadString}`);
      const r = await dualAcceptVerify({ payloadString, signatureHex: sig, timestamp: now, killRows: killRows ?? [], appStatus: appRow.app_status });
      results.push({
        id: "P2", name: "NEXT signature verifies via dual-accept",
        expected: `signature_valid=true, slot_used=next, secret_ref=${NEXT_REF}, fingerprint_prefix length=8, would_dispatch=false, dispatch_blocked=true`,
        actual: `signature_valid=${r.signature_valid}, slot_used=${r.slot_used}, secret_ref=${r.secret_ref}, fingerprint_prefix=${r.fingerprint_prefix}, would_dispatch=${r.would_dispatch}, dispatch_blocked=${r.dispatch_blocked}`,
        pass: r.signature_valid === true && r.slot_used === "next" && r.secret_ref === NEXT_REF && typeof r.fingerprint_prefix === "string" && r.fingerprint_prefix.length === 8 && r.would_dispatch === false && r.dispatch_blocked === true,
        safe: { ...r, secret_value_returned: false },
      });
    }

    // Test 3 — Bad signature rejected
    {
      const bad = "0".repeat(64);
      const r = await dualAcceptVerify({ payloadString, signatureHex: bad, timestamp: now, killRows: killRows ?? [], appStatus: appRow.app_status });
      results.push({
        id: "P3", name: "Bad signature rejected",
        expected: "signature_valid=false, would_dispatch=false",
        actual: `signature_valid=${r.signature_valid}, would_dispatch=${r.would_dispatch}`,
        pass: r.signature_valid === false && r.would_dispatch === false,
        safe: r,
      });
    }

    // Test 4 — Stale timestamp rejected
    {
      const stale = now - 3600;
      const sig = activeVal ? await hmacSha256Hex(activeVal, `${stale}.${payloadString}`) : "0".repeat(64);
      const r = await dualAcceptVerify({ payloadString, signatureHex: sig, timestamp: stale, killRows: killRows ?? [], appStatus: appRow.app_status });
      results.push({
        id: "P4", name: "Stale timestamp rejected",
        expected: "reason=timestamp_outside_window, would_dispatch=false",
        actual: `reason=${r.reason}, would_dispatch=${r.would_dispatch}`,
        pass: r.reason === "timestamp_outside_window" && r.would_dispatch === false,
        safe: r,
      });
    }

    // Test 5 — Kill-switch still blocks dispatch (with valid NEXT sig)
    if (nextVal) {
      const sig = await hmacSha256Hex(nextVal, `${now}.${payloadString}`);
      const r = await dualAcceptVerify({ payloadString, signatureHex: sig, timestamp: now, killRows: killRows ?? [], appStatus: appRow.app_status });
      results.push({
        id: "P5", name: "Kill-switch blocks dispatch even with valid NEXT",
        expected: "signature_valid=true, kill_switch_clear=false, ok=false, would_dispatch=false",
        actual: `signature_valid=${r.signature_valid}, kill_switch_clear=${r.kill_switch_clear}, ok=${r.ok}, would_dispatch=${r.would_dispatch}`,
        pass: r.signature_valid === true && r.kill_switch_clear === false && r.ok === false && r.would_dispatch === false,
        safe: r,
      });
    } else {
      results.push({ id: "P5", name: "Kill-switch blocks dispatch", pass: false, actual: "NEXT secret missing" });
    }

    // Test 6 — App remains design_only
    {
      const isDesignOnly = appRow.app_status === "design_only";
      results.push({
        id: "P6", name: "App remains design_only",
        expected: "app_status=design_only, would_dispatch=false, dispatch_blocked=true",
        actual: `app_status=${appRow.app_status}, would_dispatch=false, dispatch_blocked=true`,
        pass: isDesignOnly,
        safe: { app_status: appRow.app_status, would_dispatch: false, dispatch_blocked: true },
      });
    }

    // Test 7 — PREVIOUS slot absent (must NOT be provisioned in Gate #1)
    results.push({
      id: "P7", name: "PREVIOUS slot absent",
      expected: `${PREVIOUS_REF} not provisioned (present=false)`,
      actual: `present=${!!previousVal}`,
      pass: !previousVal,
      safe: { secret_ref: PREVIOUS_REF, present: !!previousVal },
    });

    // Postflight log counts
    const tableCount = async (t: string) => {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true });
      return [t, count ?? 0] as const;
    };
    const counts = Object.fromEntries(await Promise.all([
      tableCount("vos_signed_inbox"),
      tableCount("vos_inbound_log"),
      tableCount("vos_outbound_log"),
      tableCount("vos_decision_log"),
      tableCount("vos_killswitch_log"),
    ]));

    const { data: flags } = await admin.from("vos_platform_flags").select("flag_key, flag_value, locked");
    const required = { VANTO_OS_ENABLED: "false", EMAIL_SEND_ENABLED: "false", WHATSAPP_SEND_ENABLED: "false", MASTER_PROSPECTOR_STATE: "ASLEEP", PHASE_4A_STEP_3: "OFF" };
    const flags_locked_ok = Object.entries(required).every(([k, v]) => {
      const row = (flags ?? []).find((f: any) => f.flag_key === k);
      return row?.flag_value === v && row?.locked === true;
    });
    const globalKill = (killRows ?? []).some((k: any) => k.scope === "global" && k.scope_target === "*" && k.state === "engaged");

    const passed = results.filter((r) => r.pass).length;
    return json({
      ok: results.every((r) => r.pass),
      mode: "step4g_pilot_runner_host_only",
      pilot_app: PILOT_APP,
      total: results.length,
      passed,
      failed: results.length - passed,
      slot_inventory,                  // ← presence + fingerprint_prefix only, NEVER values
      results,
      postflight: {
        log_counts: counts,
        log_count_checks_ok: Object.values(counts).every((n) => n === 0),
        flags: flags ?? [],
        flags_locked_ok,
        global_kill_switch_engaged: globalKill,
        all_apps_design_only_check: appRow.app_status === "design_only",
        no_publisher: true,
        no_consumer: true,
        no_dispatcher: true,
        no_customer_facing_action: true,
        rotation_audit_rows_written: 0,
        notice: "Step 4G Gate #1 dry-run. NO promotion. NO PREVIOUS provisioned. NO dispatch. NO sends. Secret values NEVER returned.",
      },
    });
  } catch (e: any) {
    return json({ ok: false, reason: "exception", error: String(e?.message ?? e) }, 500);
  }
});
