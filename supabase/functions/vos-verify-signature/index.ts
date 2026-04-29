// Vanto OS — HMAC Signature Verifier (verify-only, admin-gated)
// Phase 1 Step 4A — hardened. NO dispatch. NO live traffic. NO real secrets.
// Validates: HMAC-SHA256 signature + timestamp window (replay protection).
//
// Access protection (defence in depth):
//   1. supabase/config.toml sets verify_jwt = true (platform rejects anon callers).
//   2. In-code: caller must be authenticated AND have user_roles.role='admin'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes
const RATE_LIMIT_PER_MIN = 30;

// In-memory per-IP rate limiter (best-effort; resets on cold start).
const RATE: Map<string, { count: number; windowStart: number }> = new Map();

function rateLimit(req: Request): { ok: boolean; remaining: number } {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const now = Date.now();
  const bucket = RATE.get(ip);
  if (!bucket || now - bucket.windowStart > 60_000) {
    RATE.set(ip, { count: 1, windowStart: now });
    return { ok: true, remaining: RATE_LIMIT_PER_MIN - 1 };
  }
  bucket.count += 1;
  return { ok: bucket.count <= RATE_LIMIT_PER_MIN, remaining: Math.max(0, RATE_LIMIT_PER_MIN - bucket.count) };
}

async function requireAdmin(req: Request): Promise<{ ok: boolean; status?: number; reason?: string; userId?: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return { ok: false, status: 401, reason: "missing_bearer_token" };
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimErr } = await supabase.auth.getClaims(token);
  if (claimErr || !claims?.claims?.sub) return { ok: false, status: 401, reason: "invalid_token" };
  const userId = claims.claims.sub as string;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true, userId };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
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

function parseSignatureHeader(header: string | null): { version: string; hex: string } | null {
  if (!header) return null;
  const m = header.match(/^v(\d+)=([0-9a-f]+)$/i);
  if (!m) return null;
  return { version: `v${m[1]}`, hex: m[2].toLowerCase() };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  // 1. Rate limit (per IP, in-memory)
  const rl = rateLimit(req);
  if (!rl.ok) {
    return new Response(JSON.stringify({ ok: false, reason: "rate_limited", limit_per_min: RATE_LIMIT_PER_MIN }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // 2. Admin-only auth gate
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ ok: false, reason: gate.reason }),
      { status: gate.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();

    // ─── Step 4D admin-only test harness ──────────────────────────────────────
    // mode: "sign_and_verify" — given a payload + source_app, the function
    // resolves the registry-stored ACTIVE secret, signs server-side, then
    // immediately verifies. The secret value is NEVER returned to the caller.
    // Used ONLY by the admin console test panel. Performs no DB writes,
    // no dispatch, no inbox insert, no outbound traffic.
    if (body?.mode === "sign_and_verify") {
      const sourceApp = body?.source_app;
      const targetApp = body?.target_app ?? null;
      const payloadStr = typeof body?.payload_string === "string" ? body.payload_string : JSON.stringify(body?.payload ?? {});
      if (!sourceApp || typeof sourceApp !== "string") {
        return new Response(JSON.stringify({ ok: false, reason: "missing_source_app" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: appRow } = await admin.from("vos_app_registry")
        .select("app_key, owner_scope, app_status, public_key_ref")
        .eq("app_key", sourceApp).maybeSingle();
      if (!appRow || appRow.owner_scope !== "vanto_admin_ecosystem") {
        return new Response(JSON.stringify({ ok: false, reason: "unknown_or_unauthorized_source_app" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const secretValue = appRow.public_key_ref ? Deno.env.get(appRow.public_key_ref) : undefined;
      if (!secretValue) {
        return new Response(JSON.stringify({ ok: false, reason: "no_secret_resolved", secret_ref: appRow.public_key_ref ?? null }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const ts = body?.timestamp_override ?? Math.floor(Date.now() / 1000);
      const signedBody = `${ts}.${payloadStr}`;
      const signedHex = await hmacSha256Hex(secretValue, signedBody);
      // Tampering switches for negative tests
      const sigToReturn = body?.tamper_signature === true ? signedHex.replace(/.$/, signedHex.slice(-1) === "0" ? "1" : "0") : signedHex;
      const sigHeader = `v1=${sigToReturn}`;
      // Self-verify
      const verifies = timingSafeEqual(hexToBytes(signedHex), hexToBytes(sigToReturn));
      // Kill-switch eval
      const { data: killRows } = await admin.from("vos_kill_switches").select("scope, scope_target, state").eq("state", "engaged");
      const targets = new Set<string>((killRows ?? []).map((k: any) => `${k.scope}:${k.scope_target}`));
      const killBlocks = targets.has("global:*") || targets.has(`app:${sourceApp}`) || (targetApp ? targets.has(`app:${targetApp}`) : false);
      const fpBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secretValue));
      const fingerprint_prefix = Array.from(new Uint8Array(fpBuf)).slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");
      return new Response(JSON.stringify({
        ok: verifies && !killBlocks,
        mode: "sign_and_verify",
        source_app: sourceApp,
        target_app: targetApp,
        timestamp: ts,
        signature_header: sigHeader,            // safe — derived, not the secret
        secret_source: "registry",
        secret_ref: appRow.public_key_ref,      // name only
        fingerprint_prefix,                     // 8 hex chars only
        signature_valid: verifies,
        kill_switch_clear: !killBlocks,
        app_status: appRow.app_status,
        would_dispatch: false,
        dispatch_blocked: true,
        notice: "Step 4D admin test harness. NO dispatch. NO inbox write. NO outbound traffic.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // ──────────────────────────────────────────────────────────────────────────

    const {
      payload_string,
      signature_header,
      timestamp,
      source_app,
      target_app,
      secret_override, // admin-test-only escape hatch; disabled unless allow_secret_override=true
      allow_secret_override,
    } = body ?? {};

    const checks = {
      has_payload: !!payload_string,
      has_signature: false,
      signature_format_valid: false,
      timestamp_present: !!timestamp,
      timestamp_within_window: false,
      source_app_known: false,
      owner_scope_ok: false,
      target_app_match: false,
      app_not_revoked: false,
      app_status_design_only_or_approved: false,
      kill_switch_clear: false,
      secret_resolved: false,
      signature_valid: false,
      dispatch_blocked: true, // ALWAYS true in Phase 1 — no dispatcher exists
    };

    if (!payload_string || typeof payload_string !== "string") {
      return new Response(JSON.stringify({ ok: false, reason: "missing_payload_string", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = parseSignatureHeader(signature_header);
    checks.has_signature = !!signature_header;
    checks.signature_format_valid = !!parsed;
    if (!parsed) {
      return new Response(JSON.stringify({ ok: false, reason: "missing_or_invalid_signature_format", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ts = Number(timestamp);
    if (Number.isFinite(ts)) {
      const nowSec = Math.floor(Date.now() / 1000);
      checks.timestamp_within_window = Math.abs(nowSec - ts) <= REPLAY_WINDOW_SECONDS;
    }
    if (!checks.timestamp_within_window) {
      return new Response(JSON.stringify({ ok: false, reason: "timestamp_outside_window", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!source_app || typeof source_app !== "string") {
      return new Response(JSON.stringify({ ok: false, reason: "missing_source_app", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Service-role client to read registry + kill-switches (RLS bypass for admin-gated function)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Lookup source app in registry
    const { data: appRow } = await admin
      .from("vos_app_registry")
      .select("app_key, owner_scope, app_status, public_key_ref")
      .eq("app_key", source_app)
      .maybeSingle();

    if (!appRow) {
      return new Response(JSON.stringify({ ok: false, reason: "unknown_source_app", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    checks.source_app_known = true;
    checks.owner_scope_ok = appRow.owner_scope === "vanto_admin_ecosystem";
    if (!checks.owner_scope_ok) {
      return new Response(JSON.stringify({ ok: false, reason: "owner_scope_violation", checks }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    checks.app_not_revoked = appRow.app_status !== "revoked";
    checks.app_status_design_only_or_approved =
      appRow.app_status === "design_only" || appRow.app_status === "approved";
    if (!checks.app_not_revoked) {
      return new Response(JSON.stringify({ ok: false, reason: "app_revoked", checks }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Optional target_app match
    if (target_app && typeof target_app === "string") {
      const { data: targetRow } = await admin
        .from("vos_app_registry")
        .select("app_key, owner_scope")
        .eq("app_key", target_app)
        .maybeSingle();
      checks.target_app_match =
        !!targetRow && targetRow.owner_scope === "vanto_admin_ecosystem";
      if (!checks.target_app_match) {
        return new Response(JSON.stringify({ ok: false, reason: "target_app_mismatch", checks }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      checks.target_app_match = true; // not required for raw signature verification
    }

    // Kill-switch check: global '*' OR app-scope on source_app OR target_app
    const { data: killRows } = await admin
      .from("vos_kill_switches")
      .select("scope, scope_target, state")
      .eq("state", "engaged");
    const targets = new Set<string>();
    for (const k of killRows ?? []) {
      targets.add(`${k.scope}:${k.scope_target}`);
    }
    const killBlocks =
      targets.has("global:*") ||
      targets.has(`app:${source_app}`) ||
      (target_app ? targets.has(`app:${target_app}`) : false);
    checks.kill_switch_clear = !killBlocks;
    // NOTE: We do NOT early-return on kill_switch_clear=false. The verifier still
    // computes signature_valid for dry-run observability, but `dispatch_blocked`
    // remains true and `would_dispatch` is forced to false below.

    // Resolve HMAC secret. Priority:
    //   1. Registry-resolved secret via public_key_ref (current naming debt — holds HMAC ref)
    //   2. Admin-test-only `secret_override` ONLY if `allow_secret_override === true`
    let secretValue: string | undefined;
    let secretSource: "registry" | "admin_override" | "none" = "none";
    let secretRef: string | null = null;

    if (appRow.public_key_ref) {
      const v = Deno.env.get(appRow.public_key_ref);
      if (typeof v === "string" && v.length > 0) {
        secretValue = v;
        secretSource = "registry";
        secretRef = appRow.public_key_ref;
      }
    }
    if (!secretValue && allow_secret_override === true && typeof secret_override === "string" && secret_override.length > 0) {
      secretValue = secret_override;
      secretSource = "admin_override";
    }
    if (!secretValue) {
      return new Response(JSON.stringify({
        ok: false,
        reason: "no_secret_resolved",
        secret_ref: secretRef,
        checks,
        notice: "Per-app HMAC secret not resolvable from registry. secret_override only honored when allow_secret_override=true (admin test path).",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    checks.secret_resolved = true;

    const signedBody = `${ts}.${payload_string}`;
    const expectedHex = await hmacSha256Hex(secretValue, signedBody);
    checks.signature_valid = timingSafeEqual(hexToBytes(expectedHex), hexToBytes(parsed.hex));

    // Fingerprint of the resolved secret for audit display (first 8 hex of SHA-256). Never the secret.
    const fpBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secretValue));
    const fingerprint_prefix = Array.from(new Uint8Array(fpBuf))
      .slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");

    return new Response(JSON.stringify({
      ok: checks.signature_valid && checks.kill_switch_clear,
      version: parsed.version,
      source_app,
      target_app: target_app ?? null,
      secret_source: secretSource,
      secret_ref: secretRef,
      fingerprint_prefix, // 8 hex chars only — safe to display
      would_dispatch: false, // Phase 1: dispatcher does not exist
      checks,
      notice: "Step 4C dry-run verifier. Per-app HMAC resolved from registry. NO live dispatch. NO publisher. NO consumer.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, reason: "exception", error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
