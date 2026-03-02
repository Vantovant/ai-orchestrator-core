import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const VERTEX_BRIDGE_URL = Deno.env.get("VERTEX_BRIDGE_URL");
    const VERTEX_BRIDGE_TOKEN = Deno.env.get("VERTEX_BRIDGE_TOKEN");

    if (!VERTEX_BRIDGE_URL) {
      return new Response(JSON.stringify({
        error: "Vertex Bridge not configured yet. GOV knowledge store creation is pending bridge deployment. Please provide VERTEX_BRIDGE_URL and VERTEX_BRIDGE_TOKEN once your Cloud Run bridge is ready.",
        pending: true,
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { workspace_id } = await req.json();
    if (!workspace_id) throw new Error("workspace_id required");

    // Call Vertex Bridge to create RAG corpus
    const bridgeHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (VERTEX_BRIDGE_TOKEN) bridgeHeaders["Authorization"] = `Bearer ${VERTEX_BRIDGE_TOKEN}`;

    const corpusRes = await fetch(`${VERTEX_BRIDGE_URL}/create-corpus`, {
      method: "POST",
      headers: bridgeHeaders,
      body: JSON.stringify({
        display_name: `vantoos-gov-kb-${workspace_id}`,
        description: "VantoOS GOV workspace knowledge base",
      }),
    });

    if (!corpusRes.ok) {
      const errText = await corpusRes.text();
      throw new Error(`Vertex Bridge corpus creation failed [${corpusRes.status}]: ${errText}`);
    }

    const corpus = await corpusRes.json();
    const corpusResource = corpus.corpus_resource || corpus.name;

    // Update kb_workspaces
    const { error: updateErr } = await supabase
      .from("kb_workspaces")
      .update({ vertex_corpus_resource: corpusResource })
      .eq("id", workspace_id)
      .eq("user_id", user.id);

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`);

    return new Response(JSON.stringify({ corpus_resource: corpusResource }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
