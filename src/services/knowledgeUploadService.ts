import { supabase } from "@/integrations/supabase/client";
import { extractTextFromFile, isExtractableFile } from "@/lib/fileExtractor";

export interface UploadResult {
  docId: string;
  fileId: string;
  path: string;
  chunksCreated: number;
  extractionError?: string;
}

/**
 * Attempt to call kb-ingest-upload with extracted text.
 * Returns chunks created, or throws with a clear message.
 */
async function invokeIngest(docId: string, extractedText: string): Promise<number> {
  const { data: result, error: fnErr } = await supabase.functions.invoke("kb-ingest-upload", {
    body: { doc_id: docId, extracted_text: extractedText },
  });

  if (fnErr) {
    // FunctionsFetchError = network/CORS/deploy issue
    const msg = fnErr.message || String(fnErr);
    if (msg.includes("FunctionsFetchError") || msg.includes("Failed to send")) {
      throw new Error("Edge Function unreachable (CORS/deploy issue). File is uploaded, but indexing failed. Try the Retry button.");
    }
    throw new Error(msg);
  }

  if (result?.error) throw new Error(result.error);
  return result?.chunks || 0;
}

export async function retryIngestion(docId: string, manualText?: string): Promise<{ chunksCreated: number }> {
  let text = manualText?.trim() || "";

  if (!text) {
    // Try to get raw_text already on the doc
    const { data: doc } = await supabase
      .from("knowledge_docs")
      .select("raw_text")
      .eq("id", docId)
      .single();
    text = (doc as any)?.raw_text?.trim() || "";
  }

  if (!text) {
    throw new Error("No text available. Please paste text manually.");
  }

  // Update status to processing
  await supabase
    .from("knowledge_docs")
    .update({ status: "processing" } as any)
    .eq("id", docId);

  try {
    const chunks = await invokeIngest(docId, text);
    return { chunksCreated: chunks };
  } catch (e: any) {
    await supabase
      .from("knowledge_docs")
      .update({ status: "extraction_failed" } as any)
      .eq("id", docId);
    throw e;
  }
}

export async function uploadKnowledgeFile(
  file: File,
  projectId: string | null,
  title?: string,
  tags?: string[],
): Promise<UploadResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const docTitle = title?.trim() || file.name;
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();

  // 1. Create knowledge_doc
  const { data: doc, error: docErr } = await supabase
    .from("knowledge_docs")
    .insert({
      title: docTitle,
      user_id: user.id,
      project_id: projectId,
      source_type: "upload",
      tags: tags || [],
      status: "uploading",
    } as any)
    .select()
    .single();

  if (docErr || !doc) throw new Error(docErr?.message || "Failed to create doc");
  const docId = (doc as any).id as string;

  // 2. Upload to storage
  const folderPrefix = projectId || "global";
  const storagePath = `${user.id}/${folderPrefix}/${docId}/${timestamp}_${safeFilename}`;

  const { error: uploadErr } = await supabase.storage
    .from("knowledge-uploads")
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (uploadErr) {
    await supabase.from("knowledge_docs").delete().eq("id", docId);
    throw new Error(`Upload failed: ${uploadErr.message}`);
  }

  // 3. Insert knowledge_files row
  const { data: kf, error: kfErr } = await supabase
    .from("knowledge_files" as any)
    .insert({
      user_id: user.id,
      project_id: projectId,
      doc_id: docId,
      path: storagePath,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select()
    .single();

  if (kfErr) console.error("knowledge_files insert error:", kfErr);
  const fileId = (kf as any)?.id || "";

  // 4. Extract text and ingest
  let chunksCreated = 0;
  let extractionError: string | undefined;

  if (isExtractableFile(file)) {
    try {
      const extractedText = await extractTextFromFile(file);
      if (extractedText.trim()) {
        chunksCreated = await invokeIngest(docId, extractedText);
      } else {
        // No text but file uploaded OK
        await supabase
          .from("knowledge_docs")
          .update({ status: "ready" } as any)
          .eq("id", docId);
      }
    } catch (e: any) {
      extractionError = e.message || "Text extraction failed";
      console.error("Extraction/ingestion error:", e);
      await supabase
        .from("knowledge_docs")
        .update({ status: "extraction_failed" } as any)
        .eq("id", docId);
    }
  } else {
    // Non-extractable file type — just mark ready
    await supabase
      .from("knowledge_docs")
      .update({ status: "ready" } as any)
      .eq("id", docId);
  }

  if (!extractionError && chunksCreated > 0) {
    await supabase
      .from("knowledge_docs")
      .update({ status: "ready" } as any)
      .eq("id", docId);
  }

  return { docId, fileId, path: storagePath, chunksCreated, extractionError };
}

export async function getFileDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("knowledge-uploads")
    .createSignedUrl(path, 3600);

  if (error) throw error;
  return data.signedUrl;
}

export async function getKnowledgeFile(docId: string) {
  const { data, error } = await supabase
    .from("knowledge_files" as any)
    .select("*")
    .eq("doc_id", docId)
    .maybeSingle();

  if (error) throw error;
  return data as any;
}
