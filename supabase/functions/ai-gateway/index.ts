import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GatewayRequest {
  messages: Array<{ role: string; content: string }>;
  tools?: any[];
  tool_choice?: any;
  model?: string;
  preference?: "fastest" | "quality";
  workspace_type?: "private" | "nm" | "gov";
  calling_function?: string;
}

interface ProviderConfig {
  name: string;
  url: string;
  getHeaders: () => Record<string, string>;
  getModel: (requestedModel?: string) => string;
}

function getUserProviders(openaiKey: string | null, geminiKey: string | null, preference: "fastest" | "quality" = "fastest"): ProviderConfig[] {
  const providers: ProviderConfig[] = [];
  const openai: ProviderConfig | null = openaiKey ? {
    name: "openai", url: "https://api.openai.com/v1/chat/completions",
    getHeaders: () => ({ Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" }),
    getModel: () => "gpt-4o-mini",
  } : null;
  const gemini: ProviderConfig | null = geminiKey ? {
    name: "gemini", url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    getHeaders: () => ({ Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" }),
    getModel: () => "gemini-2.5-flash",
  } : null;
  if (preference === "quality") { if (openai) providers.push(openai); if (gemini) providers.push(gemini); }
  else { if (gemini) providers.push(gemini); if (openai) providers.push(openai); }
  return providers;
}

function getVertexBridgeProvider(): ProviderConfig | null {
  const bridgeUrl = Deno.env.get("VERTEX_BRIDGE_URL");
  const bridgeToken = Deno.env.get("VERTEX_BRIDGE_TOKEN");
  if (!bridgeUrl || !bridgeToken) return null;
  return {
    name: "vertex_bridge", url: `${bridgeUrl}/v1/chat/completions`,
    getHeaders: () => ({ Authorization: `Bearer ${bridgeToken}`, "Content-Type": "application/json" }),
    getModel: () => "gemini-2.5-flash",
  };
}

function getLovableAIProvider(): ProviderConfig | null {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return null;
  return {
    name: "lovable_managed", url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    getHeaders: () => ({ Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" }),
    getModel: () => "google/gemini-3-flash-preview",
  };
}

async function tryProvider(provider: ProviderConfig, body: GatewayRequest, timeoutMs = 30000): Promise<{ ok: boolean; data?: any; status?: number; provider: string; errorDetail?: string }> {
  try {
    const headers = provider.getHeaders();
    if (!headers.Authorization || headers.Authorization === "Bearer " || headers.Authorization === "Bearer undefined" || headers.Authorization === "Bearer null") {
      return { ok: false, status: 0, provider: provider.name, errorDetail: "empty_key" };
    }
  } catch { return { ok: false, status: 0, provider: provider.name, errorDetail: "key_error" }; }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const requestBody: any = { model: provider.getModel(body.model), messages: body.messages };
    if (body.tools) requestBody.tools = body.tools;
    if (body.tool_choice) requestBody.tool_choice = body.tool_choice;
    const res = await fetch(provider.url, { method: "POST", headers: provider.getHeaders(), body: JSON.stringify(requestBody), signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const status = res.status;
      let errorText = ""; try { errorText = await res.text(); } catch {}
      console.error(`[ai-gateway] ${provider.name} failed: ${status} ${errorText.slice(0, 200)}`);
      return { ok: false, status, provider: provider.name, errorDetail: `http_${status}` };
    }
    const data = await res.json();
    return { ok: true, data, provider: provider.name };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[ai-gateway] ${provider.name} error:`, msg);
    return { ok: false, status: 0, provider: provider.name, errorDetail: msg.includes("abort") ? "timeout" : "network_error" };
  }
}

async function logAiCall(db: any, userId: string, callingFunction: string, primaryProvider: string, usedProvider: string, fallbackProvider: string | null, snapshotLen: number, wasTruncated: boolean, byokUser: boolean, durationMs: number | null, errorCode: string | null) {
  try {
    await db.from("ai_call_log").insert({ user_id: userId, calling_function: callingFunction, primary_provider: primaryProvider, used_provider: usedProvider, fallback_provider: fallbackProvider, snapshot_len: snapshotLen, was_truncated: wasTruncated, byok_user: byokUser, duration_ms: durationMs, error_code: errorCode });
  } catch (e: unknown) { console.error("[ai-gateway] log error:", e); }
}

function extractResult(data: any): any {
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) { try { return JSON.parse(toolCall.function.arguments); } catch {} }
  return data?.choices?.[0]?.message?.content ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as GatewayRequest;
    const preference = body.preference ?? "fastest";
    const workspaceType = body.workspace_type ?? "private";
    const callingFunction = body.calling_function ?? "unknown";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;
    const db = createClient(supabaseUrl, serviceKey);

    // ── STEP 0: Auth — fail closed ──
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      console.log("[ai-gateway] AUTH MISSING — fail closed");
      return new Response(JSON.stringify({ result: null, ai_status: "blocked", provider_used: "none", mode: "blocked", message: "AUTH_MISSING" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      console.log("[ai-gateway] Invalid token — fail closed:", authErr?.message);
      return new Response(JSON.stringify({ result: null, ai_status: "blocked", provider_used: "none", mode: "blocked", message: "AUTH_MISSING" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userId = user.id;
    console.log("[ai-gateway] Authenticated user:", userId, "calling:", callingFunction);

    const startTime = Date.now();
    const snapshotLen = JSON.stringify(body.messages).length;
    const modeAllowed = workspaceType !== "gov" && workspaceType !== "nda";

    // ── GOV/NDA: Vertex Bridge or BYOK only ──
    if (!modeAllowed) {
      // Try BYOK first
      const { data: keyData } = await db.from("user_ai_keys").select("use_own_keys, openai_key_encrypted, gemini_key_encrypted").eq("user_id", userId).maybeSingle();
      if (keyData?.use_own_keys && (keyData.openai_key_encrypted || keyData.gemini_key_encrypted)) {
        const providers = getUserProviders(keyData.openai_key_encrypted, keyData.gemini_key_encrypted, preference);
        for (const provider of providers) {
          const result = await tryProvider(provider, body);
          if (result.ok) {
            await logAiCall(db, userId, callingFunction, provider.name, provider.name, null, snapshotLen, false, true, Date.now() - startTime, null);
            return new Response(JSON.stringify({ result: extractResult(result.data), raw: result.data, ai_status: "ok", provider_used: provider.name, mode: "byok", message: `Generated by ${provider.name} (GOV/NDA BYOK)` }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }
      // Try Vertex Bridge
      const vertexProvider = getVertexBridgeProvider();
      if (vertexProvider) {
        const result = await tryProvider(vertexProvider, body);
        if (result.ok) {
          await logAiCall(db, userId, callingFunction, "vertex_bridge", "vertex_bridge", null, snapshotLen, false, false, Date.now() - startTime, null);
          return new Response(JSON.stringify({ result: extractResult(result.data), raw: result.data, ai_status: "ok", provider_used: "vertex_bridge", mode: "byok", message: "Generated by vertex_bridge (GOV)" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      await logAiCall(db, userId, callingFunction, "none", "none", null, snapshotLen, false, false, Date.now() - startTime, "policy_blocked_no_provider");
      return new Response(JSON.stringify({ result: null, ai_status: "blocked", provider_used: "none", mode: "blocked", message: "POLICY_BLOCKED — GOV/NDA workspace requires BYOK or approved bridge" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Fetch user keys + roles + beta status in parallel ──
    const [keysResult, roleResult, betaResult] = await Promise.all([
      db.from("user_ai_keys").select("use_own_keys, openai_key_encrypted, gemini_key_encrypted").eq("user_id", userId).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", userId),
      db.from("beta_testers").select("*").eq("user_id", userId).eq("is_active", true).maybeSingle(),
    ]);

    const keys = keysResult.data;
    const byokUser = !!(keys?.use_own_keys && (keys?.openai_key_encrypted || keys?.gemini_key_encrypted));
    const openaiKey = keys?.use_own_keys ? keys.openai_key_encrypted : null;
    const geminiKey = keys?.use_own_keys ? keys.gemini_key_encrypted : null;
    const isSuperAdmin = !!(roleResult.data && ["admin", "super_admin"].includes(roleResult.data.role));
    const betaData = betaResult.data;
    const isBetaTester = !!betaData;
    const assistedRemaining = betaData?.assisted_ai_remaining ?? 0;
    const assistedExpired = betaData?.assisted_ai_expires_at ? new Date(betaData.assisted_ai_expires_at) < new Date() : false;

    // ── B) BYOK path ──
    if (openaiKey || geminiKey) {
      const providers = getUserProviders(openaiKey, geminiKey, preference);
      const failedProviders: string[] = [];

      for (let i = 0; i < providers.length; i++) {
        const provider = providers[i];
        const result = await tryProvider(provider, body);
        if (result.ok) {
          await logAiCall(db, userId, callingFunction, providers[0].name, provider.name, i > 0 ? providers[0].name : null, snapshotLen, false, true, Date.now() - startTime, null);
          console.log("[ai-gateway] SUCCESS user:", userId, "provider:", provider.name, "mode: byok");
          return new Response(JSON.stringify({ result: extractResult(result.data), raw: result.data, ai_status: "ok", provider_used: provider.name, mode: "byok", message: `Generated by ${provider.name}` }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        failedProviders.push(`${provider.name}:${result.errorDetail || result.status}`);
      }

      // All BYOK failed — super admin gets platform fallback
      if (isSuperAdmin) {
        const lovable = getLovableAIProvider();
        if (lovable) {
          const result = await tryProvider(lovable, body);
          if (result.ok) {
            await logAiCall(db, userId, callingFunction, providers[0]?.name ?? "none", "lovable_managed", "platform_admin_fallback", snapshotLen, false, true, Date.now() - startTime, null);
            console.log("[ai-gateway] SUCCESS user:", userId, "provider: lovable_managed", "mode: platform_admin_fallback");
            return new Response(JSON.stringify({ result: extractResult(result.data), raw: result.data, ai_status: "ok", provider_used: "lovable_managed", mode: "platform_admin_fallback", message: `Admin fallback after BYOK failure (${failedProviders.join(", ")})` }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }
      }

      // No fallback for normal users — degraded
      await logAiCall(db, userId, callingFunction, providers[0]?.name ?? "none", "none", null, snapshotLen, false, true, Date.now() - startTime, failedProviders.join(";"));
      console.log("[ai-gateway] ALL BYOK FAILED user:", userId, "isSuperAdmin:", isSuperAdmin);
      return new Response(JSON.stringify({ result: null, ai_status: "error", provider_used: "none", mode: "byok", message: "AI provider unreachable — update keys in Settings → AI Keys." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── C) No BYOK ──
    // C1) Beta tester with remaining
    if (isBetaTester && assistedRemaining > 0 && !assistedExpired) {
      const lovable = getLovableAIProvider();
      if (lovable) {
        const result = await tryProvider(lovable, body);
        if (result.ok) {
          // Decrement AFTER success
          await db.from("beta_testers").update({
            assisted_ai_remaining: assistedRemaining - 1,
            assisted_ai_used: (betaData?.assisted_ai_used ?? 0) + 1,
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId);

          await logAiCall(db, userId, callingFunction, "lovable_managed", "lovable_managed", null, snapshotLen, false, false, Date.now() - startTime, null);
          console.log("[ai-gateway] SUCCESS user:", userId, "mode: assisted_beta, remaining:", assistedRemaining - 1);
          return new Response(JSON.stringify({ result: extractResult(result.data), raw: result.data, ai_status: "ok", provider_used: "lovable_managed", mode: "assisted_beta", assisted_remaining: assistedRemaining - 1, message: "Generated via assisted mode" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await logAiCall(db, userId, callingFunction, "lovable_managed", "none", null, snapshotLen, false, false, Date.now() - startTime, result.errorDetail || "assisted_failed");
      }
    }

    // C2) Super admin — platform assist
    if (isSuperAdmin) {
      const lovable = getLovableAIProvider();
      if (lovable) {
        const result = await tryProvider(lovable, body);
        if (result.ok) {
          await logAiCall(db, userId, callingFunction, "lovable_managed", "lovable_managed", null, snapshotLen, false, false, Date.now() - startTime, null);
          console.log("[ai-gateway] SUCCESS user:", userId, "mode: platform_admin");
          return new Response(JSON.stringify({ result: extractResult(result.data), raw: result.data, ai_status: "ok", provider_used: "lovable_managed", mode: "platform_admin", message: "Generated via admin platform assist" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        await logAiCall(db, userId, callingFunction, "lovable_managed", "none", null, snapshotLen, false, false, Date.now() - startTime, result.errorDetail || "admin_assist_failed");
      }
    }

    // C3) Hard block
    const blockReason = isBetaTester && assistedRemaining === 0 ? "ASSIST_EXHAUSTED" : "NO_KEY";
    await logAiCall(db, userId, callingFunction, "none", "blocked", null, snapshotLen, false, false, 0, `blocked_${blockReason.toLowerCase()}`);
    console.log("[ai-gateway] BLOCKED user:", userId, "reason:", blockReason);
    return new Response(JSON.stringify({ result: null, ai_status: "blocked", provider_used: "none", mode: "blocked", message: blockReason === "ASSIST_EXHAUSTED" ? "Assisted mode finished. Add your API key in Settings → AI Keys." : "Connect your OpenAI or Gemini key in Settings → AI Keys." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[ai-gateway] error:", e);
    return new Response(JSON.stringify({ result: null, ai_status: "error", provider_used: "none", message: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
