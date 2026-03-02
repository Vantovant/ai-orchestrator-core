import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { redactText } from "../redact-sensitive/index.ts";

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

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const workspaceId = formData.get("workspace_id") as string;
    const tagsRaw = formData.get("tags") as string;

    if (!file || !workspaceId) throw new Error("file and workspace_id required");

    // Get workspace to find vector store id
    const { data: ws, error: wsErr } = await supabase
      .from("kb_workspaces")
      .select("openai_vector_store_id")
      .eq("id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (wsErr || !ws?.openai_vector_store_id) throw new Error("Workspace not found or no vector store. Create one first.");

    // Redact filename
    const { redacted_text: safeFilename } = redactText(file.name);

    // Upload file to OpenAI
    const uploadForm = new FormData();
    uploadForm.append("file", file, safeFilename);
    uploadForm.append("purpose", "assistants");

    const uploadRes = await fetch("https://api.openai.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`OpenAI file upload failed [${uploadRes.status}]: ${errText}`);
    }

    const uploadedFile = await uploadRes.json();

    // Attach file to vector store
    const attachRes = await fetch(`https://api.openai.com/v1/vector_stores/${ws.openai_vector_store_id}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: uploadedFile.id }),
    });

    if (!attachRes.ok) {
      const errText = await attachRes.text();
      throw new Error(`Vector store attach failed [${attachRes.status}]: ${errText}`);
    }

    const attached = await attachRes.json();

    // Write kb_files row
    const tags = tagsRaw ? JSON.parse(tagsRaw) : [];
    const { error: insertErr } = await supabase.from("kb_files").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      provider: "openai",
      provider_file_id: uploadedFile.id,
      provider_container_id: ws.openai_vector_store_id,
      filename: safeFilename,
      file_size_bytes: file.size,
      tags,
      status: attached.status === "completed" ? "ready" : "processing",
    });

    if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

    return new Response(JSON.stringify({
      file_id: uploadedFile.id,
      vector_store_file_status: attached.status,
      filename: safeFilename,
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
