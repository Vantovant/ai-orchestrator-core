// Vanto OS — Idempotency Verifier (verify-only, admin-gated)
// Phase 1 Step 4A — hardened. Read-only DB lookup. NO insert. NO dispatch.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEY_REGEX = /^[a-f0-9]{32}$/;
const RATE_LIMIT_PER_MIN = 30;
const RATE: Map<string, { count: number; windowStart: number }> = new Map();

function rateLimit(req: Request): boolean {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const b = RATE.get(ip);
  if (!b || now - b.windowStart > 60_000) {
    RATE.set(ip, { count: 1, windowStart: now });
    return true;
  }
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
    const { idempotency_key } = await req.json();
    const checks = { key_present: !!idempotency_key, key_format_valid: false, duplicate_found: false };

    if (!idempotency_key || typeof idempotency_key !== "string") {
      return new Response(JSON.stringify({ ok: false, reason: "missing_idempotency_key", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    checks.key_format_valid = KEY_REGEX.test(idempotency_key);
    if (!checks.key_format_valid) {
      return new Response(JSON.stringify({
        ok: false, reason: "invalid_key_format",
        expected: "32 lowercase hex chars (truncated SHA-256)", checks,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await supabase
      .from("vos_signed_inbox")
      .select("id, source_app, event_name, processing_state, received_at")
      .eq("idempotency_key", idempotency_key)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ ok: false, reason: "db_lookup_error", error: error.message, checks }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    checks.duplicate_found = !!data;

    return new Response(JSON.stringify({
      ok: !checks.duplicate_found,
      deduped: checks.duplicate_found,
      existing: data ?? null,
      checks,
      notice: "Phase 1 verifier. Read-only. No insert. No dispatch.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, reason: "exception", error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
