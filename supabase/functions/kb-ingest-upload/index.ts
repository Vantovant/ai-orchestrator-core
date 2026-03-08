import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function hashContent(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Auth check with user client
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { doc_id, extracted_text } = await req.json();
    if (!doc_id) throw new Error("doc_id required");

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify doc ownership
    const { data: doc, error: docErr } = await adminClient
      .from("knowledge_docs")
      .select("id, user_id")
      .eq("id", doc_id)
      .single();

    if (docErr || !doc) throw new Error("Document not found");
    if (doc.user_id !== user.id) throw new Error("Not authorized for this document");

    const text = (extracted_text || "").trim();
    if (!text) {
      return new Response(JSON.stringify({ ok: true, chunks: 0, message: "No text to process" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update raw_text on knowledge_docs
    await adminClient
      .from("knowledge_docs")
      .update({ raw_text: text, status: "processed" })
      .eq("id", doc_id);

    // Chunk into ~800-word segments
    const words = text.split(/\s+/);
    const chunkSize = 800;
    const chunks: { doc_id: string; chunk_index: number; content: string; token_count: number; content_hash: string }[] = [];

    for (let i = 0; i < words.length; i += chunkSize) {
      const slice = words.slice(i, i + chunkSize).join(" ");
      chunks.push({
        doc_id,
        chunk_index: chunks.length,
        content: slice,
        token_count: Math.ceil(slice.length / 4),
        content_hash: hashContent(slice),
      });
    }

    // Delete old chunks for this doc, then insert new
    await adminClient.from("knowledge_chunks").delete().eq("doc_id", doc_id);

    if (chunks.length > 0) {
      const { error: insertErr } = await adminClient.from("knowledge_chunks").insert(chunks);
      if (insertErr) throw insertErr;
    }

    return new Response(JSON.stringify({ ok: true, chunks: chunks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
