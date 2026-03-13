import { supabase } from "@/integrations/supabase/client";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  order_index: number;
  source: string | null;
  estimated_minutes: number | null;
  project_id: string | null;
  dedupe_key: string | null;
  note_id: string | null;
  last_touched_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TaskInsert = Pick<Task, "title"> & Partial<Pick<Task, "description" | "status" | "priority" | "due_date" | "start_date" | "completed_at" | "order_index" | "source" | "estimated_minutes" | "project_id" | "dedupe_key" | "note_id">>;

export interface BulkUpsertItemResult {
  client_temp_id: string;
  dedupe_key: string;
  status: "created" | "merged" | "failed";
  id?: string;
  reason?: string;
}

export interface BulkUpsertInput extends TaskInsert {
  client_temp_id: string;
}

export interface BulkUpsertResult {
  created: string[];
  merged: string[];
  failed: { title: string; reason: string }[];
  items: BulkUpsertItemResult[];
}

/** Generate a stable dedupe key from components */
export function makeDedupe(userId: string, projectId: string | null, noteId: string | null, text: string): string {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const raw = `${userId}|${projectId ?? ""}|${noteId ?? ""}|${normalized}`;
  // Simple hash – djb2
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Normalize title for fuzzy matching */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

export const taskService = {
  async list(sort: "latest" | "due_date" | "priority" = "latest") {
    let query = supabase
      .from("tasks")
      .select("*")
      .is("deleted_at", null);

    if (sort === "due_date") {
      query = query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
    } else if (sort === "priority") {
      query = query.order("priority", { ascending: true }).order("created_at", { ascending: false });
    } else {
      query = query.order("last_touched_at", { ascending: false }).order("created_at", { ascending: false });
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Task[];
  },

  /** Find existing duplicate by dedupe_key or exact normalized title match */
  async _findDuplicate(userId: string, task: TaskInsert): Promise<Task | null> {
    // 1. Check by dedupe_key if provided
    if (task.dedupe_key) {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .eq("dedupe_key", task.dedupe_key)
        .is("deleted_at", null)
        .maybeSingle();
      if (data) return data as Task;
    }

    // 2. Fallback: exact normalized title + project match
    const norm = normalizeTitle(task.title);
    const { data: titleMatches } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .ilike("title", norm);

    if (titleMatches && titleMatches.length > 0) {
      // Match same project scope
      const match = titleMatches.find(t =>
        (t.project_id ?? null) === (task.project_id ?? null)
      );
      if (match) return match as Task;
    }

    return null;
  },

  async create(task: TaskInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Auto-generate dedupe_key if not provided
    if (!task.dedupe_key) {
      task.dedupe_key = makeDedupe(user.id, task.project_id ?? null, task.note_id ?? null, task.title);
    }

    // Check for duplicates before creating
    const existing = await this._findDuplicate(user.id, task);
    if (existing) {
      // Merge: update fields that may have changed
      const { data, error } = await supabase
        .from("tasks")
        .update({
          description: task.description ?? existing.description,
          priority: task.priority ?? existing.priority,
          due_date: task.due_date ?? existing.due_date,
          source: task.source ?? existing.source,
          last_touched_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    }

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

  async bulkUpsert(tasks: BulkUpsertInput[]): Promise<BulkUpsertResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const result: BulkUpsertResult = { created: [], merged: [], failed: [], items: [] };

    for (const task of tasks) {
      const { client_temp_id: ctid, ...dbTask } = task;

      // Auto-generate dedupe_key if missing
      if (!dbTask.dedupe_key) {
        dbTask.dedupe_key = makeDedupe(user.id, dbTask.project_id ?? null, dbTask.note_id ?? null, dbTask.title);
      }
      const dk = dbTask.dedupe_key || "";

      try {
        const existing = await this._findDuplicate(user.id, dbTask);

        if (existing) {
          const { data, error } = await supabase
            .from("tasks")
            .update({
              description: dbTask.description ?? existing.description,
              priority: dbTask.priority ?? existing.priority,
              due_date: dbTask.due_date ?? existing.due_date,
              source: dbTask.source ?? existing.source,
              last_touched_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select()
            .single();
          if (error) throw error;
          result.merged.push(data.id);
          result.items.push({ client_temp_id: ctid, dedupe_key: dk, status: "merged", id: data.id });
          continue;
        }

        const { data, error } = await supabase
          .from("tasks")
          .insert({ ...dbTask, user_id: user.id, last_touched_at: new Date().toISOString() })
          .select()
          .single();
        if (error) throw error;
        result.created.push(data.id);
        result.items.push({ client_temp_id: ctid, dedupe_key: dk, status: "created", id: data.id });
      } catch (e: any) {
        result.failed.push({ title: dbTask.title, reason: e.message || "Unknown error" });
        result.items.push({ client_temp_id: ctid, dedupe_key: dk, status: "failed", reason: e.message || "Unknown error" });
      }
    }

    return result;
  },
};
