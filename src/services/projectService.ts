import { supabase } from "@/integrations/supabase/client";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string;
  solution_type: string;
  progress_manual: number;
  progress_mode: string;
  tags: string[];
  is_blocked: boolean;
  is_pinned: boolean;
  health: string;
  blocked_reason: string | null;
  blocked_by: string | null;
  unblock_eta: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ProjectInsert = Pick<Project, "name"> &
  Partial<Pick<Project, "description" | "status" | "progress_manual" | "progress_mode" | "tags" | "is_blocked" | "is_pinned">>;

export interface ProjectNote {
  id: string;
  user_id: string;
  project_id: string;
  note_date: string;
  content: string;
  structured_json: any;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ProjectLink {
  id: string;
  user_id: string;
  project_id: string;
  label: string;
  url: string;
  created_at: string;
  deleted_at: string | null;
}

export const projectService = {
  async list() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data as Project[];
  },

  async get(id: string) {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (error) throw error;
    return data as Project;
  },

  async create(project: ProjectInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...project, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Project;
  },

  async update(id: string, updates: Partial<ProjectInsert>) {
    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return data as Project;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  // Linked items
  async getLinkedTasks(projectId: string) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },

  async getLinkedMeetings(projectId: string) {
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("start_time", { ascending: true });
    if (error) throw error;
    return data;
  },

  async getLinkedReminders(projectId: string) {
    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("reminder_time", { ascending: true });
    if (error) throw error;
    return data;
  },

  // Progress calculation
  async calculateProgress(projectId: string, mode: string, manualProgress: number) {
    if (mode === "manual") return manualProgress;
    const tasks = await this.getLinkedTasks(projectId);
    if (!tasks || tasks.length === 0) return manualProgress;
    const done = tasks.filter((t: any) => t.status === "done").length;
    return Math.round((done / tasks.length) * 100);
  },
};

export const projectNotesService = {
  async list(projectId: string) {
    const { data, error } = await supabase
      .from("project_notes")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("note_date", { ascending: false });
    if (error) throw error;
    return data as ProjectNote[];
  },

  async getByDate(projectId: string, date: string) {
    const { data, error } = await supabase
      .from("project_notes")
      .select("*")
      .eq("project_id", projectId)
      .eq("note_date", date)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as ProjectNote | null;
  },

  async upsert(projectId: string, noteDate: string, content: string, structuredJson?: any) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const existing = await this.getByDate(projectId, noteDate);
    if (existing) {
      const { data, error } = await supabase
        .from("project_notes")
        .update({ content, structured_json: structuredJson ?? {} })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as ProjectNote;
    } else {
      const { data, error } = await supabase
        .from("project_notes")
        .insert({ project_id: projectId, user_id: user.id, note_date: noteDate, content, structured_json: structuredJson ?? {} })
        .select()
        .single();
      if (error) throw error;
      return data as ProjectNote;
    }
  },
};

export const projectLinksService = {
  async list(projectId: string) {
    const { data, error } = await supabase
      .from("project_links")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as ProjectLink[];
  },

  async create(projectId: string, label: string, url: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("project_links")
      .insert({ project_id: projectId, user_id: user.id, label, url })
      .select()
      .single();
    if (error) throw error;
    return data as ProjectLink;
  },

  async remove(id: string) {
    const { error } = await supabase
      .from("project_links")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
