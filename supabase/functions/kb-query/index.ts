import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { workspace_id, question, project_id } = await req.json();
    if (!workspace_id || !question) throw new Error("workspace_id and question required");

    // Get workspace to determine provider
    const { data: ws, error: wsErr } = await supabase
      .from("kb_workspaces")
      .select("*")
      .eq("id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (wsErr || !ws) throw new Error("Workspace not found");

    // Provider routing
    let provider = ws.default_provider;
    if (ws.workspace_type === "gov" && !ws.default_provider) {
      provider = "vertex";
    } else if (ws.workspace_type !== "gov") {
      provider = ws.default_provider || "openai";
    }

    // Route to provider-specific function, passing project_id for scoped retrieval
    const fnName = provider === "vertex" ? "kb-vertex-query" : "kb-openai-query";

    const providerRes = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({ workspace_id, question, project_id }),
    });

    const providerData = await providerRes.json();

    if (!providerRes.ok) {
      return new Response(JSON.stringify(providerData), {
        status: providerRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If project_id was passed, also retrieve project-scoped knowledge_docs chunks
    if (project_id) {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceKey);

      // Get doc IDs for this project (+ global)
      const { data: docs } = await adminClient
        .from("knowledge_docs")
        .select("id")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .or(`project_id.eq.${project_id},project_id.is.null`);

      if (docs && docs.length > 0) {
        const docIds = docs.map((d: any) => d.id);
        const { data: chunks } = await adminClient
          .from("knowledge_chunks")
          .select("content, chunk_index, doc_id")
          .in("doc_id", docIds)
          .order("chunk_index", { ascending: true })
          .limit(5);

        if (chunks && chunks.length > 0) {
          providerData.project_chunks = chunks.map((c: any) => c.content);
        }
      }
    }

    // NEEDS_VERIFICATION rule
    if (question.toLowerCase().match(/fund(er|ing|s)|program|grant|investor/)) {
      providerData.needs_verification = true;
      providerData.verification_warning = "⚠️ NEEDS_VERIFICATION: Specific funders/programs mentioned may not be verified. Please confirm with verified sources before acting.";
    }

    providerData.routed_provider = provider;
    providerData.workspace_type = ws.workspace_type;
    providerData.project_scoped = !!project_id;

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
