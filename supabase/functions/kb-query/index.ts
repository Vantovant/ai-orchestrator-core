import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { workspace_id, question } = await req.json();
    if (!workspace_id || !question) throw new Error("workspace_id and question required");

    // Get workspace to determine provider
    const { data: ws, error: wsErr } = await supabase
      .from("kb_workspaces")
      .select("*")
      .eq("id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (wsErr || !ws) throw new Error("Workspace not found");

    // DECISION RULE:
    // GOV workspace -> Vertex (unless manually overridden)
    // Everything else -> OpenAI (default)
    let provider = ws.default_provider;
    if (ws.workspace_type === "gov" && !ws.default_provider) {
      provider = "vertex";
    } else if (ws.workspace_type === "gov" && ws.default_provider === "openai") {
      // Manual override: respect it
      provider = "openai";
    } else if (ws.workspace_type !== "gov") {
      provider = ws.default_provider || "openai";
    }

    // Route to provider-specific function
    const fnName = provider === "vertex" ? "kb-vertex-query" : "kb-openai-query";

    const providerRes = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ workspace_id, question }),
    });

    const providerData = await providerRes.json();

    if (!providerRes.ok) {
      return new Response(JSON.stringify(providerData), {
        status: providerRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // NEEDS_VERIFICATION rule: check verified_sources
    if (question.toLowerCase().match(/fund(er|ing|s)|program|grant|investor/)) {
      const { data: verified } = await supabase
        .from("verified_sources")
        .select("id")
        .eq("workspace_id", workspace_id)
        .eq("verified", true)
        .limit(1);

      if (!verified || verified.length === 0) {
        providerData.needs_verification = true;
        providerData.verification_warning = "⚠️ NEEDS_VERIFICATION: Specific funders/programs mentioned may not be verified. Please confirm with verified sources before acting.";
      }
    }

    providerData.routed_provider = provider;
    providerData.workspace_type = ws.workspace_type;

    return new Response(JSON.stringify(providerData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
