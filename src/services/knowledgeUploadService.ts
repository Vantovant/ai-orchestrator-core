import { supabase } from "@/integrations/supabase/client";
import { extractTextFromFile, isExtractableFile } from "@/lib/fileExtractor";

export interface UploadResult {
  docId: string;
  fileId: string;
  path: string;
  chunksCreated: number;
  extractionError?: string;
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
    // Clean up doc
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
        // Send to edge function for chunking
        const { data: result, error: fnErr } = await supabase.functions.invoke("kb-ingest-upload", {
          body: { doc_id: docId, extracted_text: extractedText },
        });
        if (fnErr) throw fnErr;
        chunksCreated = result?.chunks || 0;
      }
    } catch (e: any) {
      extractionError = e.message || "Text extraction failed";
      console.error("Extraction error:", e);
      // Update doc status
      await supabase
        .from("knowledge_docs")
        .update({ status: "extraction_failed" } as any)
        .eq("id", docId);
    }
  }

  // Update status to ready if no error
  if (!extractionError) {
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
    .createSignedUrl(path, 3600); // 1 hour

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
