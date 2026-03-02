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
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { workspace_id, question } = await req.json();
    if (!workspace_id || !question) throw new Error("workspace_id and question required");

    // Redact PII from query
    const { redacted_text: safeQuestion, had_pii, counts_by_type } = redactText(question);

    // Get workspace
    const { data: ws, error: wsErr } = await supabase
      .from("kb_workspaces")
      .select("openai_vector_store_id")
      .eq("id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (wsErr || !ws?.openai_vector_store_id) throw new Error("Workspace not found or no vector store.");

    // Call OpenAI Responses API with file_search
    const responsesRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: safeQuestion,
        tools: [{
          type: "file_search",
          vector_store_ids: [ws.openai_vector_store_id],
        }],
      }),
    });

    if (!responsesRes.ok) {
      const errText = await responsesRes.text();
      throw new Error(`OpenAI Responses API failed [${responsesRes.status}]: ${errText}`);
    }

    const responsesData = await responsesRes.json();

    // Extract answer text and citations
    let answer = "";
    const citations: Array<{ filename: string; quote: string }> = [];

    for (const item of (responsesData.output || [])) {
      if (item.type === "message") {
        for (const content of (item.content || [])) {
          if (content.type === "output_text") {
            answer += content.text || "";
            // Extract annotations/citations
            for (const ann of (content.annotations || [])) {
              if (ann.type === "file_citation") {
                citations.push({
                  filename: ann.filename || "unknown",
                  quote: ann.file_citation?.quote || "",
                });
              }
            }
          }
        }
      }
    }

    // Redact the answer too
    const { redacted_text: safeAnswer } = redactText(answer);

    // Log query (redacted)
    await supabase.from("kb_query_log").insert({
      workspace_id,
      user_id: user.id,
      provider: "openai",
      query_redacted: safeQuestion,
      had_pii,
      pii_counts: counts_by_type,
    });

    return new Response(JSON.stringify({
      answer: safeAnswer,
      citations,
      provider: "openai",
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
