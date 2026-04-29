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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
    const { payload_string, signature_header, timestamp, secret_override } = body ?? {};

    const checks = {
      has_payload: !!payload_string,
      has_signature: false,
      signature_format_valid: false,
      timestamp_present: !!timestamp,
      timestamp_within_window: false,
      signature_valid: false,
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

    // Phase 1: NO real per-app secret is provisioned. Caller MUST pass a
    // test-only secret_override to exercise the HMAC path. With no override
    // the signature path returns ok=false (no oracle, no hard-coded secret).
    if (typeof secret_override !== "string" || secret_override.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        reason: "no_secret_provisioned",
        notice: "Phase 1: per-app secrets not provisioned. Pass `secret_override` (admin-only test path) to exercise HMAC.",
        checks,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const signedBody = `${ts}.${payload_string}`;
    const expectedHex = await hmacSha256Hex(secret_override, signedBody);
    checks.signature_valid = timingSafeEqual(hexToBytes(expectedHex), hexToBytes(parsed.hex));

    return new Response(JSON.stringify({
      ok: checks.signature_valid,
      version: parsed.version,
      checks,
      notice: "Phase 1 verifier. No live keys. No dispatch.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, reason: "exception", error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
