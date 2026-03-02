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

    if (!GCP_SA_KEY) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured");
    if (!GCP_PROJECT) throw new Error("GCP_PROJECT_ID not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const workspaceId = formData.get("workspace_id") as string;
    const tagsRaw = formData.get("tags") as string;

    if (!file || !workspaceId) throw new Error("file and workspace_id required");

    // Get workspace
    const { data: ws, error: wsErr } = await supabase
      .from("kb_workspaces")
      .select("vertex_corpus_resource")
      .eq("id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (wsErr || !ws?.vertex_corpus_resource) throw new Error("Workspace not found or no Vertex corpus. Create one first.");

    // Redact filename
    const { redacted_text: safeFilename } = redactText(file.name);

    const accessToken = await getGoogleAccessToken(GCP_SA_KEY);

    // Read file as bytes and convert to base64
    const fileBytes = await file.arrayBuffer();
    const base64Content = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));

    // Import RAG file into corpus
    const importRes = await fetch(
      `https://${GCP_LOCATION}-aiplatform.googleapis.com/v1beta1/${ws.vertex_corpus_resource}/ragFiles:import`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          import_rag_files_config: {
            rag_file_chunking_config: { chunk_size: 512, chunk_overlap: 100 },
          },
          upload_rag_file_config: {
            rag_file: {
              display_name: safeFilename,
              description: `Uploaded ${new Date().toISOString()}`,
            },
            content: base64Content,
          },
        }),
      }
    );

    if (!importRes.ok) {
      const errText = await importRes.text();
      throw new Error(`Vertex RAG import failed [${importRes.status}]: ${errText}`);
    }

    const importData = await importRes.json();
    const ragFileId = importData.name || "pending";

    // Write kb_files row
    const tags = tagsRaw ? JSON.parse(tagsRaw) : [];
    const { error: insertErr } = await supabase.from("kb_files").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      provider: "vertex",
      provider_file_id: ragFileId,
      provider_container_id: ws.vertex_corpus_resource,
      filename: safeFilename,
      file_size_bytes: file.size,
      tags,
      status: "processing",
    });

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    return new Response(JSON.stringify({
      rag_file_id: ragFileId,
      filename: safeFilename,
      status: "processing",
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
