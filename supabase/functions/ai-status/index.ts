import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BLOCKED_RESPONSE = (reason: string, extra: Record<string, any> = {}) => ({
  status: "blocked",
  reason_code: reason,
  hasOpenAIKey: false,
  hasGeminiKey: false,
  is_beta_tester: false,
  is_super_admin: false,
  assisted_ai_remaining: 0,
  assisted_expired: false,
  mode_allowed: false,
  workspace_type: "unknown",
  last_error: null,
  managed_mode_hint: "none",
  ...extra,
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // ── STEP 0: Auth — fail closed ──
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[ai-status] No Authorization header — fail closed");
      return new Response(JSON.stringify(BLOCKED_RESPONSE("AUTH_MISSING")), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      console.log("[ai-status] Invalid token:", authErr?.message);
      return new Response(JSON.stringify(BLOCKED_RESPONSE("AUTH_MISSING")), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log("[ai-status] Authenticated user:", userId);

    const db = createClient(supabaseUrl, serviceKey);

    // ── Parallel fetches: keys, beta, last error, super admin role ──
    const [keysResult, betaResult, lastErrorResult, roleResult] = await Promise.all([
      db.from("user_ai_keys")
        .select("use_own_keys, openai_key_encrypted, gemini_key_encrypted")
        .eq("user_id", userId)
        .maybeSingle(),
      db.from("beta_testers")
        .select("assisted_ai_remaining, assisted_ai_used, is_active, assisted_ai_expires_at, cohort_tag")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle(),
      db.from("ai_call_log")
        .select("error_code, used_provider, created_at")
        .eq("user_id", userId)
        .not("error_code", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["admin", "super_admin"])
        .limit(1)
        .maybeSingle(),
    ]);

    const keys = keysResult.data;
    const beta = betaResult.data;
    const lastErr = lastErrorResult.data;

    // ── Derived flags ──
    const hasOpenAIKey = !!(keys?.use_own_keys && keys?.openai_key_encrypted);
    const hasGeminiKey = !!(keys?.use_own_keys && keys?.gemini_key_encrypted);
    const isBetaTester = !!beta;
    const assistedRemaining = beta?.assisted_ai_remaining ?? 0;
    const isSuperAdmin = !!(roleResult.data && ["admin", "super_admin"].includes(roleResult.data.role));

    let assistedExpired = false;
    if (beta?.assisted_ai_expires_at && new Date(beta.assisted_ai_expires_at) < new Date()) {
      assistedExpired = true;
    }

    // ── STEP 1: Workspace type (from user metadata for now, DB-authoritative in future) ──
    const workspaceType = user.user_metadata?.workspace_type ?? "private";
    const modeAllowed = workspaceType !== "gov" && workspaceType !== "nda";

    // ── Sanitize last error ──
    let lastError: string | null = null;
    if (lastErr?.error_code) {
      const code = lastErr.error_code;
      if (code.includes("timeout")) lastError = "timeout";
      else if (code.includes("429") || code.includes("rate")) lastError = "rate_limited";
      else if (code.includes("401") || code.includes("403") || code.includes("empty_key")) lastError = "invalid_key";
      else if (code.includes("missing_byok")) lastError = "missing_key";
      else lastError = "provider_error";
    }

    // ── STEP 4: AI Router Decision Tree ──
    let status: string;
    let reasonCode: string;
    let managedModeHint = "none";

    // A) GOV/NDA workspace blocks managed modes
    if (!modeAllowed) {
      if (hasOpenAIKey || hasGeminiKey) {
        status = lastError && lastError !== "missing_key" ? "degraded" : "ready";
        reasonCode = lastError && lastError !== "missing_key" ? "PROVIDER_ERROR" : "OK";
        managedModeHint = "none";
      } else {
        status = "blocked";
        reasonCode = "POLICY_BLOCKED";
      }
    }
    // B) BYOK exists
    else if (hasOpenAIKey || hasGeminiKey) {
      if (lastError && lastError !== "missing_key") {
        // BYOK degraded — super admin gets platform fallback hint
        status = "degraded";
        reasonCode = "PROVIDER_ERROR";
        managedModeHint = isSuperAdmin ? "platform_admin_fallback" : "none";
      } else {
        status = "ready";
        reasonCode = "OK";
      }
    }
    // C) No BYOK
    else if (isBetaTester && assistedRemaining > 0 && !assistedExpired && modeAllowed) {
      status = "assisted";
      reasonCode = "OK";
      managedModeHint = "assisted_beta";
    }
    else if (isSuperAdmin && modeAllowed) {
      // Super admin with no BYOK — platform assist allowed
      status = "ready";
      reasonCode = "OK";
      managedModeHint = "platform_admin";
    }
    else if (isBetaTester && assistedRemaining === 0) {
      status = "blocked";
      reasonCode = "ASSIST_EXHAUSTED";
    }
    else {
      status = "blocked";
      reasonCode = "NO_KEY";
    }

    console.log("[ai-status] Result:", { userId, status, reasonCode, hasOpenAIKey, hasGeminiKey, isBetaTester, isSuperAdmin, assistedRemaining, managedModeHint });

    return new Response(JSON.stringify({
      status,
      reason_code: reasonCode,
      hasOpenAIKey,
      hasGeminiKey,
      is_beta_tester: isBetaTester,
      is_super_admin: isSuperAdmin,
      assisted_ai_remaining: assistedRemaining,
      assisted_expired: assistedExpired,
      mode_allowed: modeAllowed,
      workspace_type: workspaceType,
      last_error: lastError,
      managed_mode_hint: managedModeHint,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("[ai-status] error:", e);
    return new Response(JSON.stringify(BLOCKED_RESPONSE("AUTH_MISSING", {
      last_error: e instanceof Error ? e.message : String(e),
    })), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
