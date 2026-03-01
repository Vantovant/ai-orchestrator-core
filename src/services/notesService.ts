import { supabase } from "@/integrations/supabase/client";

export interface DailyNote {
  id: string;
  user_id: string;
  note_date: string;
  content: string;
  structured_mode: boolean;
  structure_json: Record<string, string>;
  links_json: any[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const STRUCTURE_FIELDS = ["wins", "risks", "decisions", "people", "ideas", "gratitude", "followups"] as const;
export type StructureField = typeof STRUCTURE_FIELDS[number];

export const STRUCTURE_LABELS: Record<StructureField, string> = {
  wins: "🏆 Wins",
  risks: "⚠️ Risks",
  decisions: "🔨 Decisions",
  people: "👥 People",
  ideas: "💡 Ideas",
  gratitude: "🙏 Gratitude",
  followups: "📋 Follow-ups",
};

export const notesService = {
  async getByDate(date: string): Promise<DailyNote | null> {
    const { data, error } = await supabase
      .from("notes_daily")
      .select("*")
      .eq("note_date", date)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as DailyNote | null;
  },

  async upsert(date: string, content: string, structuredMode: boolean, structureJson: Record<string, string>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: existing } = await supabase
      .from("notes_daily")
      .select("id")
      .eq("note_date", date)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("notes_daily")
        .update({ content, structured_mode: structuredMode, structure_json: structureJson })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as DailyNote;
    } else {
      const { data, error } = await supabase
        .from("notes_daily")
        .insert({ user_id: user.id, note_date: date, content, structured_mode: structuredMode, structure_json: structureJson })
        .select()
        .single();
      if (error) throw error;
      return data as DailyNote;
    }
  },

  async listRecent(limit = 7): Promise<DailyNote[]> {
    const { data, error } = await supabase
      .from("notes_daily")
      .select("*")
      .is("deleted_at", null)
      .order("note_date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as DailyNote[];
  },
};
