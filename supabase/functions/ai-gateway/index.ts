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

// Build user-key providers from decrypted keys
function getUserProviders(
  openaiKey: string | null,
  geminiKey: string | null,
  preference: "fastest" | "quality" = "fastest"
): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  const openai: ProviderConfig | null = openaiKey ? {
    name: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    getHeaders: () => ({
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    }),
    getModel: () => "gpt-4o-mini",
  } : null;

  const gemini: ProviderConfig | null = geminiKey ? {
    name: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    getHeaders: () => ({
      Authorization: `Bearer ${geminiKey}`,
      "Content-Type": "application/json",
    }),
    getModel: () => "gemini-2.5-flash",
  } : null;

  if (preference === "quality") {
    if (openai) providers.push(openai);
    if (gemini) providers.push(gemini);
  } else {
    if (gemini) providers.push(gemini);
    if (openai) providers.push(openai);
  }

  return providers;
}

// GOV workspace: route through Vertex Bridge (keyless, no user key needed)
function getVertexBridgeProvider(): ProviderConfig | null {
  const bridgeUrl = Deno.env.get("VERTEX_BRIDGE_URL");
  const bridgeToken = Deno.env.get("VERTEX_BRIDGE_TOKEN");
  if (!bridgeUrl || !bridgeToken) return null;

  return {
    name: "vertex_bridge",
    url: `${bridgeUrl}/v1/chat/completions`,
    getHeaders: () => ({
      Authorization: `Bearer ${bridgeToken}`,
      "Content-Type": "application/json",
    }),
    getModel: () => "gemini-2.5-flash",
  };
}

async function tryProvider(
  provider: ProviderConfig,
  body: GatewayRequest,
  timeoutMs = 30000,
): Promise<{ ok: boolean; data?: any; status?: number; provider: string }> {
  try {
    const headers = provider.getHeaders();
    if (!headers.Authorization || headers.Authorization === "Bearer " || headers.Authorization === "Bearer undefined" || headers.Authorization === "Bearer null") {
      return { ok: false, status: 0, provider: provider.name };
    }
  } catch {
    return { ok: false, status: 0, provider: provider.name };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const requestBody: any = {
      model: provider.getModel(body.model),
      messages: body.messages,
    };
    if (body.tools) requestBody.tools = body.tools;
    if (body.tool_choice) requestBody.tool_choice = body.tool_choice;

    const res = await fetch(provider.url, {
      method: "POST",
      headers: provider.getHeaders(),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const status = res.status;
      console.error(`[ai-gateway] ${provider.name} failed: ${status}`);
      try { await res.text(); } catch {}
      return { ok: false, status, provider: provider.name };
    }

    const data = await res.json();
    return { ok: true, data, provider: provider.name };
  } catch (e) {
    console.error(`[ai-gateway] ${provider.name} error:`, e);
    return { ok: false, status: 0, provider: provider.name };
  }
}

// Log AI call to ai_call_log
async function logAiCall(
  db: any,
  userId: string,
  callingFunction: string,
  primaryProvider: string,
  usedProvider: string,
  fallbackProvider: string | null,
  snapshotLen: number,
  wasTruncated: boolean,
  byokUser: boolean,
  durationMs: number | null,
  errorCode: string | null,
) {
  try {
    await db.from("ai_call_log").insert({
      user_id: userId,
      calling_function: callingFunction,
      primary_provider: primaryProvider,
      used_provider: usedProvider,
      fallback_provider: fallbackProvider,
      snapshot_len: snapshotLen,
      was_truncated: wasTruncated,
      byok_user: byokUser,
      duration_ms: durationMs,
      error_code: errorCode,
    });
  } catch (e) {
    console.error("[ai-gateway] log error:", e);
  }
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
    const db = createClient(supabaseUrl, serviceKey);

    // Resolve user from auth header
    const authHeader = req.headers.get("Authorization") ?? "";
    let userId = "anonymous";
    try {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) userId = user.id;
    } catch {}

    const startTime = Date.now();

    // ---- GOV WORKSPACE: Vertex Bridge only ----
    if (workspaceType === "gov") {
      const vertexProvider = getVertexBridgeProvider();
      if (!vertexProvider) {
        return new Response(JSON.stringify({
          result: null,
          ai_status: "error",
          provider_used: "none",
          message: "Vertex Bridge not configured for GOV workspace",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const result = await tryProvider(vertexProvider, body);
      const durationMs = Date.now() - startTime;

      if (result.ok) {
        const toolCall = result.data?.choices?.[0]?.message?.tool_calls?.[0];
        let parsed: any = null;
        if (toolCall) {
          try { parsed = JSON.parse(toolCall.function.arguments); } catch {}
        }

        await logAiCall(db, userId, callingFunction, "vertex_bridge", "vertex_bridge", null,
          JSON.stringify(body.messages).length, false, false, durationMs, null);

        return new Response(JSON.stringify({
          result: parsed ?? result.data?.choices?.[0]?.message?.content ?? null,
          raw: result.data,
          ai_status: "ok",
          provider_used: "vertex_bridge",
          message: "Generated by vertex_bridge (GOV)",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await logAiCall(db, userId, callingFunction, "vertex_bridge", "none", null,
        JSON.stringify(body.messages).length, false, false, durationMs, String(result.status));

      return new Response(JSON.stringify({
        result: null,
        ai_status: "error",
        provider_used: "none",
        message: "Vertex Bridge unavailable",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- PRIVATE / NM WORKSPACE: BYOK only ----
    // Fetch user's AI keys
    let openaiKey: string | null = null;
    let geminiKey: string | null = null;
    let byokUser = false;

    if (userId !== "anonymous") {
      const { data: keyData } = await db
        .from("user_ai_keys")
        .select("use_own_keys, openai_key_encrypted, gemini_key_encrypted")
        .eq("user_id", userId)
        .maybeSingle();

      if (keyData?.use_own_keys) {
        byokUser = true;
        openaiKey = keyData.openai_key_encrypted || null;
        geminiKey = keyData.gemini_key_encrypted || null;
      }
    }

    // HARD BLOCK: No BYOK keys connected
    if (!openaiKey && !geminiKey) {
      // Log blocked event (no provider call made)
      await logAiCall(db, userId, callingFunction, "none", "blocked_missing_byok", null,
        JSON.stringify(body.messages).length, false, false, 0, "missing_byok");

      return new Response(JSON.stringify({
        result: null,
        ai_status: "blocked",
        provider_used: "none",
        message: "Connect your AI key in Settings → AI Keys to use AI features. To guarantee absolute data sovereignty for this private cohort, a personal OpenAI or Gemini key is required.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build provider list from user keys
    const providers = getUserProviders(openaiKey, geminiKey, preference);
    let lastStatus = 0;
    let fallbackProvider: string | null = null;

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      const result = await tryProvider(provider, body);
      const durationMs = Date.now() - startTime;

      if (result.ok) {
        const toolCall = result.data?.choices?.[0]?.message?.tool_calls?.[0];
        let parsed: any = null;
        if (toolCall) {
          try { parsed = JSON.parse(toolCall.function.arguments); } catch {}
        }

        await logAiCall(db, userId, callingFunction, providers[0].name, provider.name,
          i > 0 ? providers[0].name : null,
          JSON.stringify(body.messages).length, false, byokUser, durationMs, null);

        return new Response(JSON.stringify({
          result: parsed ?? result.data?.choices?.[0]?.message?.content ?? null,
          raw: result.data,
          ai_status: "ok",
          provider_used: provider.name,
          message: `Generated by ${provider.name}`,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      lastStatus = result.status ?? 0;
      if (i === 0 && providers.length > 1) fallbackProvider = providers[1].name;
    }

    // All user providers failed
    const durationMs = Date.now() - startTime;
    const aiStatus = lastStatus === 429 ? "rate_limited" : "error";
    const message = lastStatus === 429 ? "AI providers rate limited" : "AI providers unavailable — check your API keys in Settings";

    await logAiCall(db, userId, callingFunction, providers[0]?.name ?? "none", "none",
      fallbackProvider, JSON.stringify(body.messages).length, false, byokUser, durationMs, String(lastStatus));

    return new Response(JSON.stringify({
      result: null,
      ai_status: aiStatus,
      provider_used: "none",
      message,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[ai-gateway] error:", e);
    return new Response(JSON.stringify({
      result: null,
      ai_status: "error",
      provider_used: "none",
      message: String(e),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
