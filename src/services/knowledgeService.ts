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
    // "all" = no project filter

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
    return data as KnowledgeDoc;
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
};
