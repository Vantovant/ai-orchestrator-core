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
  /** Caller-provided client_temp_id echoed back for deterministic UI mapping */
  client_temp_id: string;
  dedupe_key: string;
  status: "created" | "merged" | "failed";
  id?: string;
  reason?: string;
}

export interface BulkUpsertInput extends TaskInsert {
  /** Opaque caller ID echoed back in results – NOT stored in DB */
  client_temp_id: string;
}

export interface BulkUpsertResult {
  created: string[];
  merged: string[];
  failed: { title: string; reason: string }[];
  /** Deterministic per-item results keyed by client_temp_id */
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

  /**
   * Bulk upsert tasks with dedupe_key. Returns created/merged/failed breakdown.
   */
  async bulkUpsert(tasks: TaskInsert[]): Promise<BulkUpsertResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const result: BulkUpsertResult = { created: [], merged: [], failed: [], items: [] };

    for (const task of tasks) {
      const dk = task.dedupe_key || "";
      try {
        if (task.dedupe_key) {
          // Check if exists
          const { data: existing } = await supabase
            .from("tasks")
            .select("id")
            .eq("user_id", user.id)
            .eq("dedupe_key", task.dedupe_key)
            .is("deleted_at", null)
            .maybeSingle();

          if (existing) {
            // Merge – update fields that may have changed + touch
            const { data, error } = await supabase
              .from("tasks")
              .update({
                description: task.description,
                priority: task.priority,
                due_date: task.due_date,
                source: task.source,
                last_touched_at: new Date().toISOString(),
              })
              .eq("id", existing.id)
              .select()
              .single();
            if (error) throw error;
            result.merged.push(data.id);
            result.items.push({ dedupe_key: dk, status: "merged", id: data.id });
            continue;
          }
        }

        // Create new
        const { data, error } = await supabase
          .from("tasks")
          .insert({ ...task, user_id: user.id, last_touched_at: new Date().toISOString() })
          .select()
          .single();
        if (error) throw error;
        result.created.push(data.id);
        result.items.push({ dedupe_key: dk, status: "created", id: data.id });
      } catch (e: any) {
        result.failed.push({ title: task.title, reason: e.message || "Unknown error" });
        result.items.push({ dedupe_key: dk, status: "failed", reason: e.message || "Unknown error" });
      }
    }

    return result;
  },
};
