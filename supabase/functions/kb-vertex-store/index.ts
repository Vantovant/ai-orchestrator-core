import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  // Import private key
  const pemContents = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signInput)
  );

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${header}.${payload}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${await tokenRes.text()}`);
  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GCP_SA_KEY = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
    const GCP_PROJECT = Deno.env.get("GCP_PROJECT_ID");
    const GCP_LOCATION = Deno.env.get("GCP_LOCATION") || "us-central1";

    if (!GCP_SA_KEY) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured. Required for Vertex AI.");
    if (!GCP_PROJECT) throw new Error("GCP_PROJECT_ID not configured. Required for Vertex AI.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { workspace_id } = await req.json();
    if (!workspace_id) throw new Error("workspace_id required");

    const accessToken = await getGoogleAccessToken(GCP_SA_KEY);

    // Create Vertex RAG corpus
    const corpusRes = await fetch(
      `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT}/locations/${GCP_LOCATION}/ragCorpora`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: `vantoos-gov-kb-${workspace_id}`,
          description: "VantoOS GOV workspace knowledge base",
        }),
      }
    );

    if (!corpusRes.ok) {
      const errText = await corpusRes.text();
      throw new Error(`Vertex corpus creation failed [${corpusRes.status}]: ${errText}`);
    }

    const corpus = await corpusRes.json();
    const corpusResource = corpus.name || corpus.metadata?.name;

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
