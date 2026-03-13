import { supabase } from "@/integrations/supabase/client";

export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  attendees: any;
  notes: string | null;
  project_id: string | null;
  is_done: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type MeetingInsert = Pick<Meeting, "title" | "start_time" | "end_time"> & Partial<Pick<Meeting, "description" | "location" | "attendees" | "notes" | "project_id">>;

export const meetingService = {
  async list() {
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .is("deleted_at", null)
      .order("start_time", { ascending: true });
    if (error) throw error;
    return data as Meeting[];
  },

  async create(meeting: MeetingInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("meetings")
      .insert({ ...meeting, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Meeting;
  },

  async update(id: string, updates: Partial<MeetingInsert & { is_done: boolean }>) {
    const { data, error } = await supabase
      .from("meetings")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return data as Meeting;
  },

  async toggleDone(id: string, is_done: boolean) {
    const { data, error } = await supabase
      .from("meetings")
      .update({ is_done })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Meeting;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("meetings")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
