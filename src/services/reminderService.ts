import { supabase } from "@/integrations/supabase/client";

export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  reminder_time: string;
  is_done: boolean;
  task_id: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ReminderInsert = Pick<Reminder, "title" | "reminder_time"> & Partial<Pick<Reminder, "description" | "task_id" | "project_id">>;

/** Normalize title for fuzzy matching */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

export const reminderService = {
  async list() {
    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .is("deleted_at", null)
      .order("reminder_time", { ascending: true });
    if (error) throw error;
    return data as Reminder[];
  },

  /** Find existing duplicate by normalized title + similar time window (same day) */
  async _findDuplicate(userId: string, reminder: ReminderInsert): Promise<Reminder | null> {
    const norm = normalizeTitle(reminder.title);
    const { data } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .ilike("title", norm);

    if (data && data.length > 0) {
      const targetDate = new Date(reminder.reminder_time);
      // Find a match on the same day with the same project
      const match = data.find(r => {
        const existingDate = new Date(r.reminder_time);
        const sameDay = existingDate.toDateString() === targetDate.toDateString();
        const sameProject = (r.project_id ?? null) === (reminder.project_id ?? null);
        return sameDay && sameProject;
      });
      if (match) return match as Reminder;
    }

    return null;
  },

  async create(reminder: ReminderInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Check for duplicates before creating
    const existing = await this._findDuplicate(user.id, reminder);
    if (existing) {
      // Merge: update fields
      const { data, error } = await supabase
        .from("reminders")
        .update({
          description: reminder.description ?? existing.description,
          reminder_time: reminder.reminder_time,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as Reminder;
    }

    const { data, error } = await supabase
      .from("reminders")
      .insert({ ...reminder, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Reminder;
  },

  async toggleDone(id: string, is_done: boolean) {
    const { data, error } = await supabase
      .from("reminders")
      .update({ is_done })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Reminder;
  },

  async update(id: string, updates: Partial<Pick<Reminder, "title" | "reminder_time" | "description">>) {
    const { data, error } = await supabase
      .from("reminders")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Reminder;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("reminders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
