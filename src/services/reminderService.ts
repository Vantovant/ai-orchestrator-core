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

  async create(reminder: ReminderInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
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
