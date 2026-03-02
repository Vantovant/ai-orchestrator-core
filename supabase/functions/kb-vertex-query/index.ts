import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { redactText } from "../redact-sensitive/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signInput = `${header}.${payload}`;
  const pemContents = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signInput));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${header}.${payload}.${sig}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
  return (await tokenRes.json()).access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GCP_SA_KEY = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
    const GCP_PROJECT = Deno.env.get("GCP_PROJECT_ID");
    const GCP_LOCATION = Deno.env.get("GCP_LOCATION") || "us-central1";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!GCP_SA_KEY) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured");
    if (!GCP_PROJECT) throw new Error("GCP_PROJECT_ID not configured");

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

    const accessToken = await getGoogleAccessToken(GCP_SA_KEY);

    // Step 1: Retrieve contexts from Vertex RAG
    const retrieveRes = await fetch(
      `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}:retrieveContexts`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          vertex_rag_store: {
            rag_resources: [{ rag_corpus: ws.vertex_corpus_resource }],
          },
          query: { text: safeQuestion, similarity_top_k: 5 },
        }),
      }
    );

    if (!retrieveRes.ok) {
      const errText = await retrieveRes.text();
      throw new Error(`Vertex retrieveContexts failed [${retrieveRes.status}]: ${errText}`);
    }

    const retrieveData = await retrieveRes.json();
    const contexts = (retrieveData.contexts?.contexts || []).map((c: any) => ({
      text: c.text || "",
      source: c.source_display_name || c.source_uri || "unknown",
      score: c.score || 0,
    }));

    const contextBlock = contexts.map((c: any) => `[Source: ${c.source}]\n${c.text}`).join("\n\n---\n\n");

    // Step 2: Pass contexts to Gemini for grounded answer
    // Use Gemini via direct API (since this is GOV context, uses Vertex-adjacent Gemini)
    const geminiUrl = GEMINI_API_KEY
      ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`
      : `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/publishers/google/models/gemini-2.5-flash:generateContent`;

    const geminiHeaders: Record<string, string> = { "Content-Type": "application/json" };
    if (!GEMINI_API_KEY) geminiHeaders["Authorization"] = `Bearer ${accessToken}`;

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: geminiHeaders,
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{
            text: `You are a knowledge assistant for a South African executive. Answer the question using ONLY the provided context. If the context doesn't contain relevant information, say so clearly. Cite sources.\n\n--- CONTEXT ---\n${contextBlock.slice(0, 3000)}\n--- END CONTEXT ---\n\nQuestion: ${safeQuestion}`,
          }],
        }],
        generationConfig: { maxOutputTokens: 1024, temperature: 0.2 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini generation failed [${geminiRes.status}]: ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const rawAnswer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "No answer generated.";

    // Redact the answer
    const { redacted_text: safeAnswer } = redactText(rawAnswer);

    const citations = contexts.map((c: any) => ({ source: c.source, score: c.score }));

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
