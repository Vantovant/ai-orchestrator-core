import { supabase } from "@/integrations/supabase/client";

export interface KnowledgeDoc {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  source_url: string | null;
  source_type: string;
  tags: string[];
  raw_text: string;
  status: string;
  external_id: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type KnowledgeDocInsert = Pick<KnowledgeDoc, "title"> &
  Partial<Pick<KnowledgeDoc, "project_id" | "source_url" | "source_type" | "tags" | "raw_text" | "status" | "external_id" | "dedupe_key">>;

export interface KnowledgeChunk {
  id: string;
  doc_id: string;
  chunk_index: number;
  content: string;
  token_count: number;
  content_hash: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectSuggestion {
  project_id: string;
  project_name: string;
  confidence: number;
  reasons: string[];
}

// ─── Smart Project Assignment ──────────────────────────────
export async function suggestProject(title: string, rawText: string): Promise<ProjectSuggestion[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Fetch user's projects
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, description, health")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!projects?.length) return [];

  const contentLower = `${title} ${rawText}`.toLowerCase();
  const suggestions: ProjectSuggestion[] = [];

  for (const p of projects) {
    let score = 0;
    const reasons: string[] = [];
    const nameLower = (p.name || "").toLowerCase();
    const descLower = (p.description || "").toLowerCase();

    // Name match
    const nameWords = nameLower.split(/\s+/).filter(w => w.length > 2);
    const matchedWords = nameWords.filter(w => contentLower.includes(w));
    if (matchedWords.length > 0) {
      score += matchedWords.length * 25;
      reasons.push(`Name keywords: ${matchedWords.join(", ")}`);
    }

    // Description keyword overlap
    if (descLower) {
      const descWords = descLower.split(/\s+/).filter(w => w.length > 3);
      const descMatches = descWords.filter(w => contentLower.includes(w));
      if (descMatches.length >= 2) {
        score += Math.min(descMatches.length * 10, 30);
        reasons.push(`${descMatches.length} description keywords matched`);
      }
    }

    // Check if user has recent knowledge docs in this project (affinity)
    const { count } = await supabase
      .from("knowledge_docs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("project_id", p.id)
      .is("deleted_at", null);

    if (count && count > 0) {
      score += 10;
      reasons.push(`${count} existing docs in project`);
    }

    if (score > 0) {
      suggestions.push({
        project_id: p.id,
        project_name: p.name || "Untitled",
        confidence: Math.min(score, 100),
        reasons,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

// ─── Chunking utility ──────────────────────────────────────
function hashContent(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export async function chunkAndStore(docId: string, rawText: string, chunkSize = 800): Promise<number> {
  if (!rawText.trim()) return 0;

  const words = rawText.split(/\s+/);
  const chunks: { content: string; chunk_index: number; content_hash: string; token_count: number }[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    const slice = words.slice(i, i + chunkSize).join(" ");
    chunks.push({
      content: slice,
      chunk_index: chunks.length,
      content_hash: hashContent(slice),
      token_count: Math.ceil(slice.length / 4), // rough estimate
    });
  }

  // Upsert chunks (delete old, insert new)
  await supabase.from("knowledge_chunks" as any).delete().eq("doc_id", docId);

  if (chunks.length > 0) {
    const rows = chunks.map(c => ({ ...c, doc_id: docId }));
    const { error } = await supabase.from("knowledge_chunks" as any).insert(rows);
    if (error) throw error;
  }

  return chunks.length;
}

// ─── CRUD ──────────────────────────────────────────────────
export const knowledgeService = {
  async list(projectId?: string | null, filter: "project" | "all" | "global" = "project") {
    let query = supabase
      .from("knowledge_docs")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (filter === "project" && projectId) {
      query = query.eq("project_id", projectId);
    } else if (filter === "global") {
      query = query.is("project_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as KnowledgeDoc[];
  },

  async create(doc: KnowledgeDocInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("knowledge_docs")
      .insert({ ...doc, user_id: user.id } as any)
      .select()
      .single();
    if (error) throw error;

    // Auto-chunk if raw_text provided
    const created = data as KnowledgeDoc;
    if (doc.raw_text?.trim()) {
      try { await chunkAndStore(created.id, doc.raw_text); } catch {}
    }

    return created;
  },

  async update(id: string, updates: Partial<KnowledgeDocInsert>) {
    const { data, error } = await supabase
      .from("knowledge_docs")
      .update(updates as any)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return data as KnowledgeDoc;
  },

  async remove(id: string) {
    const { error } = await supabase
      .from("knowledge_docs")
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) throw error;
  },

  /** Retrieve chunks for a specific project (or all) for AI context */
  async retrieveChunks(projectId: string | null, query: string, limit = 10): Promise<KnowledgeChunk[]> {
    // Get relevant doc IDs first
    let docQuery = supabase
      .from("knowledge_docs")
      .select("id")
      .is("deleted_at", null);

    if (projectId) {
      docQuery = docQuery.or(`project_id.eq.${projectId},project_id.is.null`);
    }

    const { data: docs } = await docQuery;
    if (!docs?.length) return [];

    const docIds = docs.map(d => (d as any).id as string);

    // Get chunks from those docs, basic keyword matching
    const { data: chunks, error } = await supabase
      .from("knowledge_chunks" as any)
      .select("*")
      .in("doc_id", docIds)
      .order("chunk_index", { ascending: true })
      .limit(limit);

    if (error) throw error;
    return (chunks ?? []) as unknown as KnowledgeChunk[];
  },
};
