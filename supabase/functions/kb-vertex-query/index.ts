import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const PII_PATTERNS: Record<string, RegExp> = {
  phone_intl: /\+27\s?\d[\d\s-]{7,12}/g,
  sa_id: /\b\d{13}\b/g,
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  bank_account: /\b\d{9,12}\b/g,
  phone_local: /\b0[1-9]\d[\d\s-]{7,10}\b/g,
  confidential_tag: /\[?CONFIDENTIAL\]?|RESTRICTED|SENSITIVE|PRIVILEGED/gi,
};
const PII_REPLACE: Record<string, string> = { sa_id:"[REDACTED_ID]", bank_account:"[REDACTED_BANK]", email:"[REDACTED_EMAIL]", phone_intl:"[REDACTED_PHONE]", phone_local:"[REDACTED_PHONE]", confidential_tag:"[REDACTED_TAG]" };
function redactText(text: string) {
  let result = text; const counts: Record<string,number> = {}; let had_pii = false;
  for (const [k, p] of Object.entries(PII_PATTERNS)) { const re = new RegExp(p.source, p.flags); const m = result.match(re); if (m?.length) { counts[k] = m.length; had_pii = true; result = result.replace(re, PII_REPLACE[k]); } }
  return { redacted_text: result, had_pii, counts_by_type: counts };
}

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
        error: "Vertex Bridge not configured yet. GOV queries are pending bridge deployment.",
        pending: true,
      }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { workspace_id, question } = await req.json();
    if (!workspace_id || !question) throw new Error("workspace_id and question required");

    // Redact PII
    const { redacted_text: safeQuestion, had_pii, counts_by_type } = redactText(question);

    // Get workspace
    const { data: ws, error: wsErr } = await supabase
      .from("kb_workspaces")
      .select("vertex_corpus_resource")
      .eq("id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (wsErr || !ws?.vertex_corpus_resource) throw new Error("Workspace not found or no Vertex corpus.");

    // Call Vertex Bridge for RAG query + Gemini grounded answer
    const bridgeHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (VERTEX_BRIDGE_TOKEN) bridgeHeaders["Authorization"] = `Bearer ${VERTEX_BRIDGE_TOKEN}`;

    const queryRes = await fetch(`${VERTEX_BRIDGE_URL}/query`, {
      method: "POST",
      headers: bridgeHeaders,
      body: JSON.stringify({
        corpus_resource: ws.vertex_corpus_resource,
        question: safeQuestion,
        top_k: 5,
        max_tokens: 1024,
        temperature: 0.2,
      }),
    });

    if (!queryRes.ok) {
      const errText = await queryRes.text();
      throw new Error(`Vertex Bridge query failed [${queryRes.status}]: ${errText}`);
    }

    const queryData = await queryRes.json();
    const rawAnswer = queryData.answer || "No answer generated.";

    // Redact the answer too
    const { redacted_text: safeAnswer } = redactText(rawAnswer);

    const citations = (queryData.citations || []).map((c: any) => ({
      source: c.source || c.source_display_name || "unknown",
      score: c.score || 0,
    }));

    // Log query
    await supabase.from("kb_query_log").insert({
      workspace_id,
      user_id: user.id,
      provider: "vertex",
      query_redacted: safeQuestion,
      had_pii,
      pii_counts: counts_by_type,
    });

    return new Response(JSON.stringify({
      answer: safeAnswer,
      citations,
      provider: "vertex",
      had_pii,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
