import { supabase } from "@/integrations/supabase/client";

export interface VoiceDiaryEntry {
  id: string;
  user_id: string;
  content: string;
  title: string | null;
  source_type: string;
  mood: string | null;
  linked_project_ids: string[];
  extracted_intents: any[];
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export async function getDiaryEntries(filters?: {
  limit?: number;
  from?: string;
  to?: string;
  pinned?: boolean;
}): Promise<VoiceDiaryEntry[]> {
  let query = supabase
    .from("voice_diary_entries" as any)
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters?.pinned) query = query.eq("is_pinned", true);
  if (filters?.from) query = query.gte("created_at", filters.from);
  if (filters?.to) query = query.lte("created_at", filters.to);
  query = query.limit(filters?.limit ?? 50);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as VoiceDiaryEntry[];
}

export async function createDiaryEntry(entry: {
  content: string;
  source_type?: string;
  title?: string;
  mood?: string;
  linked_project_ids?: string[];
}): Promise<VoiceDiaryEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await (supabase.from("voice_diary_entries" as any) as any)
    .insert({
      user_id: user.id,
      content: entry.content,
      source_type: entry.source_type ?? "voice",
      title: entry.title ?? null,
      mood: entry.mood ?? null,
      linked_project_ids: entry.linked_project_ids ?? [],
    })
    .select()
    .single();

  if (error) throw error;
  return data as unknown as VoiceDiaryEntry;
}

export async function updateDiaryEntry(
  id: string,
  updates: Partial<Pick<VoiceDiaryEntry, "content" | "title" | "mood" | "is_pinned" | "linked_project_ids" | "extracted_intents">>
): Promise<void> {
  const { error } = await (supabase.from("voice_diary_entries" as any) as any)
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDiaryEntry(id: string): Promise<void> {
  const { error } = await (supabase.from("voice_diary_entries" as any) as any)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
