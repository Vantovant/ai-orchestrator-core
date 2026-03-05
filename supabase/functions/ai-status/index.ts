import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // ── AUTH VALIDATION (in-code JWT check) ──
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[ai-status] No Authorization header");
      return new Response(JSON.stringify({
        status: "blocked",
        reason_code: "AUTH_MISSING",
        hasOpenAIKey: false,
        hasGeminiKey: false,
        is_beta_tester: false,
        assisted_ai_remaining: 0,
        assisted_expired: false,
        mode_allowed: false,
        workspace_type: "unknown",
        last_error: null,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate user via their token
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      console.log("[ai-status] Invalid token:", authErr?.message);
      return new Response(JSON.stringify({
        status: "blocked",
        reason_code: "AUTH_MISSING",
        hasOpenAIKey: false,
        hasGeminiKey: false,
        is_beta_tester: false,
        assisted_ai_remaining: 0,
        assisted_expired: false,
        mode_allowed: false,
        workspace_type: "unknown",
        last_error: null,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;
    console.log("[ai-status] Authenticated user:", userId);

    const db = createClient(supabaseUrl, serviceKey);

    // Fetch BYOK keys, beta tester status, and last error in parallel
    const [keysResult, betaResult, lastErrorResult] = await Promise.all([
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
    ]);

    const keys = keysResult.data;
    const beta = betaResult.data;
    const lastErr = lastErrorResult.data;

    const hasOpenAIKey = !!(keys?.use_own_keys && keys?.openai_key_encrypted);
    const hasGeminiKey = !!(keys?.use_own_keys && keys?.gemini_key_encrypted);
    const isBetaTester = !!beta;
    const assistedRemaining = beta?.assisted_ai_remaining ?? 0;

    // Check if assisted mode expired
    let assistedExpired = false;
    if (beta?.assisted_ai_expires_at && new Date(beta.assisted_ai_expires_at) < new Date()) {
      assistedExpired = true;
    }

    // Determine workspace type from user metadata (default private)
    const workspaceType = user.user_metadata?.workspace_type ?? "private";
    const modeAllowed = workspaceType !== "gov" && workspaceType !== "nda";

    // Sanitize last error
    let lastError: string | null = null;
    if (lastErr?.error_code) {
      const code = lastErr.error_code;
      if (code.includes("timeout")) lastError = "timeout";
      else if (code.includes("429") || code.includes("rate")) lastError = "rate_limited";
      else if (code.includes("401") || code.includes("403") || code.includes("empty_key")) lastError = "invalid_key";
      else if (code.includes("missing_byok")) lastError = "missing_key";
      else lastError = "provider_error";
    }

    // ── AI ROUTER: Single decision tree ──
    let status: string;
    let reasonCode: string;

    if (hasOpenAIKey || hasGeminiKey) {
      // BYOK path
      if (lastError && lastError !== "missing_key") {
        status = "degraded";
        reasonCode = "PROVIDER_ERROR";
      } else {
        status = "ready";
        reasonCode = "OK";
      }
    } else if (!modeAllowed) {
      // GOV/NDA without BYOK — hard block
      status = "blocked";
      reasonCode = "POLICY_BLOCKED";
    } else if (isBetaTester && assistedRemaining > 0 && !assistedExpired) {
      // Beta assist available
      status = "assisted";
      reasonCode = "OK";
    } else if (isBetaTester && assistedRemaining === 0) {
      // Beta tester exhausted
      status = "blocked";
      reasonCode = "ASSIST_EXHAUSTED";
    } else {
      // No key, not beta
      status = "blocked";
      reasonCode = "NO_KEY";
    }

    console.log("[ai-status] Result:", { userId, status, reasonCode, hasOpenAIKey, hasGeminiKey, isBetaTester, assistedRemaining });

    return new Response(JSON.stringify({
      status,
      reason_code: reasonCode,
      hasOpenAIKey,
      hasGeminiKey,
      is_beta_tester: isBetaTester,
      assisted_ai_remaining: assistedRemaining,
      assisted_expired: assistedExpired,
      mode_allowed: modeAllowed,
      workspace_type: workspaceType,
      last_error: lastError,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("[ai-status] error:", e);
    return new Response(JSON.stringify({
      status: "blocked",
      reason_code: "AUTH_MISSING",
      hasOpenAIKey: false,
      hasGeminiKey: false,
      is_beta_tester: false,
      assisted_ai_remaining: 0,
      assisted_expired: false,
      mode_allowed: false,
      workspace_type: "unknown",
      last_error: e instanceof Error ? e.message : String(e),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
