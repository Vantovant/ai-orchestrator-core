import { supabase } from "@/integrations/supabase/client";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  source: string | null;
  estimated_minutes: number | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TaskInsert = Pick<Task, "title"> & Partial<Pick<Task, "description" | "status" | "priority" | "due_date" | "source" | "estimated_minutes" | "project_id">>;

export const taskService = {
  async list() {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as Task[];
  },

  async create(task: TaskInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...task, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Task;
  },

  async update(id: string, updates: Partial<TaskInsert>) {
    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return data as Task;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
