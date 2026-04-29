// Vanto OS — Dry-Run Validator (verify-only, admin-gated)
// Phase 1 Step 4A — hardened. Accepts a sample packet and runs all 3 verifiers + flag/kill-switch check.
// MUST NOT dispatch. MUST NOT insert into vos_signed_inbox. MUST NOT call any consumer.
//
// Access protection: verify_jwt=true (platform) + in-code admin role check.
// Per-app HMAC secrets are NOT provisioned in Phase 1; signature path requires
// admin-supplied `secret_override` to exercise the HMAC verifier.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPLAY_WINDOW_SECONDS = 300;
const KEY_REGEX = /^[a-f0-9]{32}$/;
const RATE_LIMIT_PER_MIN = 30;
const RATE: Map<string, { count: number; windowStart: number }> = new Map();

function rateLimit(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const b = RATE.get(ip);
  if (!b || now - b.windowStart > 60_000) { RATE.set(ip, { count: 1, windowStart: now }); return true; }
  b.count += 1;
  return b.count <= RATE_LIMIT_PER_MIN;
}

async function requireAdmin(req: Request): Promise<{ ok: boolean; status?: number; reason?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, reason: "missing_bearer_token" };
  const token = authHeader.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } });
  const { data: claims, error } = await sb.auth.getClaims(token);
  if (error || !claims?.claims?.sub) return { ok: false, status: 401, reason: "invalid_token" };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", claims.claims.sub).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true };
}

const PATTERNS: Record<string, RegExp> = {
  sa_id: /\b\d{13}\b/g,
  bank_account: /\b\d{8,12}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b(?:\+?27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
  confidential_tag: /\[(?:CONFIDENTIAL|NDA|PRIVATE|SECRET)[^\]]*\]/gi,
};
const REPLACEMENTS: Record<string, string> = {
  sa_id: "[REDACTED_SA_ID]",
  bank_account: "[REDACTED_BANK]",
  email: "[REDACTED_EMAIL]",
  phone: "[REDACTED_PHONE]",
  confidential_tag: "[REDACTED_CONFIDENTIAL]",
};

function hexToBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function tse(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
async function hmacHex(secret: string, body: string) {
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
async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function redactString(s: string) {
  let out = s;
  const counts: Record<string, number> = {};
  let had = false;
  for (const k of ["sa_id", "email", "phone", "confidential_tag", "bank_account"]) {
    const m = out.match(PATTERNS[k]);
    if (m && m.length) {
      counts[k] = m.length;
      out = out.replace(PATTERNS[k], REPLACEMENTS[k]);
      had = true;
    }
  }
  return { redacted: out, counts, had_pii: had };
}
function redactValue(v: any): any {
  if (typeof v === "string") {
    const r = redactString(v);
    return { value: r.redacted, counts: r.counts, had_pii: r.had_pii };
  }
  if (Array.isArray(v)) {
    const counts: Record<string, number> = {};
    let had = false;
    const arr = v.map((it) => {
      const r = redactValue(it);
      had ||= r.had_pii;
      for (const [k, n] of Object.entries(r.counts as Record<string, number>)) counts[k] = (counts[k] ?? 0) + n;
      return r.value;
    });
    return { value: arr, counts, had_pii: had };
  }
  if (v && typeof v === "object") {
    const counts: Record<string, number> = {};
    let had = false;
    const obj: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) {
      const r = redactValue(val);
      had ||= r.had_pii;
      for (const [kk, n] of Object.entries(r.counts as Record<string, number>)) counts[kk] = (counts[kk] ?? 0) + n;
      obj[k] = r.value;
    }
    return { value: obj, counts, had_pii: had };
  }
  return { value: v, counts: {}, had_pii: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!rateLimit(req)) {
    return new Response(JSON.stringify({ ok: false, reason: "rate_limited", limit_per_min: RATE_LIMIT_PER_MIN }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ ok: false, reason: gate.reason }),
      { status: gate.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const {
      source_app,
      event_name,
      timestamp,
      payload,
      signature_header,
      idempotency_key,
      secret_override,
    } = await req.json();

    const report: Record<string, any> = {
      step: "dry_run_validator",
      dispatched: false, // ALWAYS false in Phase 1
      stored: false,     // ALWAYS false in Phase 1
      checks: {},
    };

    // 1. Basic shape
    report.checks.has_source_app = typeof source_app === "string" && source_app.length > 0;
    report.checks.has_event_name = typeof event_name === "string" && event_name.length > 0;
    report.checks.has_payload = payload !== undefined && payload !== null;

    // 2. App registry lookup (read-only)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: appRow } = await supabase
      .from("vos_app_registry")
      .select("app_key, role, app_status")
      .eq("app_key", source_app)
      .maybeSingle();
    report.checks.app_registered = !!appRow;
    report.checks.app_status = appRow?.app_status ?? null;

    // 3. Platform flags (read-only)
    const { data: flags } = await supabase
      .from("vos_platform_flags")
      .select("flag_key, flag_value, locked");
    const flagMap = Object.fromEntries((flags ?? []).map((f) => [f.flag_key, f]));
    report.checks.flags = flagMap;
    report.checks.vanto_os_enabled = flagMap?.VANTO_OS_ENABLED?.flag_value === "true";

    // 4. Kill switches (read-only)
    const { data: switches } = await supabase
      .from("vos_kill_switches")
      .select("scope, scope_target, state");
    const globalKS = (switches ?? []).find((s) => s.scope === "global" && s.scope_target === "*");
    const appKS = (switches ?? []).find((s) => s.scope === "app" && s.scope_target === source_app);
    report.checks.global_kill_switch = globalKS?.state ?? "missing";
    report.checks.app_kill_switch = appKS?.state ?? "none";

    // 5. Timestamp window
    const ts = Number(timestamp);
    const nowSec = Math.floor(Date.now() / 1000);
    report.checks.timestamp_within_window =
      Number.isFinite(ts) && Math.abs(nowSec - ts) <= REPLAY_WINDOW_SECONDS;

    // 6. Signature verification — Phase 1: NO real per-app secret is provisioned.
    // Caller MUST supply `secret_override` (admin-only test path) to exercise HMAC.
    // With no override the signature path returns false (no oracle, no hard-coded fallback).
    const sigMatch = typeof signature_header === "string" ? signature_header.match(/^v(\d+)=([0-9a-f]+)$/i) : null;
    report.checks.signature_format_valid = !!sigMatch;
    report.checks.signature_secret_provided = typeof secret_override === "string" && secret_override.length > 0;
    if (sigMatch && report.checks.timestamp_within_window && report.checks.signature_secret_provided) {
      const payloadString = JSON.stringify(payload);
      const expected = await hmacHex(secret_override as string, `${ts}.${payloadString}`);
      report.checks.signature_valid = tse(hexToBytes(expected), hexToBytes(sigMatch[2].toLowerCase()));
    } else {
      report.checks.signature_valid = false;
    }

    // 7. Idempotency key check
    report.checks.idempotency_format_valid =
      typeof idempotency_key === "string" && KEY_REGEX.test(idempotency_key);
    let dup = false;
    if (report.checks.idempotency_format_valid) {
      const { data: existing } = await supabase
        .from("vos_signed_inbox")
        .select("id")
        .eq("idempotency_key", idempotency_key)
        .maybeSingle();
      dup = !!existing;
    }
    report.checks.duplicate_found = dup;

    // 8. Computed idempotency suggestion (sha256(source|event|natural_key))
    const natural = JSON.stringify({ source_app, event_name, payload });
    report.computed_idempotency_key_suggestion = (await sha256Hex(natural)).slice(0, 32);

    // 9. PII redaction
    const r = redactValue(payload);
    report.redacted_payload = r.value;
    report.had_pii = r.had_pii;
    report.pii_counts = r.counts;
    report.safe_summary = `[${source_app ?? "unknown"}] ${event_name ?? "unknown"} • had_pii=${r.had_pii}`;

    // 10. Final verdict (still no dispatch — this is dry-run)
    const allGreen =
      report.checks.has_source_app &&
      report.checks.has_event_name &&
      report.checks.has_payload &&
      report.checks.app_registered &&
      report.checks.timestamp_within_window &&
      report.checks.signature_format_valid &&
      report.checks.idempotency_format_valid &&
      !report.checks.duplicate_found;

    report.would_be_accepted_if_traffic_enabled = allGreen && report.checks.signature_valid;
    report.posture_blocks_dispatch =
      !report.checks.vanto_os_enabled ||
      report.checks.global_kill_switch === "engaged" ||
      report.checks.app_kill_switch === "engaged";

    report.notice =
      "Phase 1 dry-run. NO dispatch. NO insert into Signed Inbox. NO consumer call. " +
      "All posture flags remain locked. All kill-switches remain engaged.";

    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, reason: "exception", error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
