import { supabase } from "@/integrations/supabase/client";

// ─── TYPES ─────────────────────────────────────────────────
export interface ImportedTask {
  id?: string;
  external_id?: string | null;
  dedupe_key?: string;
  project_id?: string;
  sort_index?: number;
  title: string;
  status: string;
  start_date?: string | null;
  due_date?: string | null;
  completed_date?: string | null;
  completed_at?: string | null;
  priority: string;
  created_at?: string;
  updated_at?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// ─── HELPERS ───────────────────────────────────────────────
function generateDedupe(userId: string, projectId: string, title: string, startDate: string | null, dueDate: string | null): string {
  const normalized = title.toLowerCase().replace(/\s+/g, " ").trim();
  const raw = `${userId}|${projectId}|${normalized}|${startDate || ""}|${dueDate || ""}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeStatus(s: string): string {
  const lower = s.toLowerCase().trim();
  if (["done", "complete", "completed", "closed"].includes(lower)) return "done";
  if (["doing", "in progress", "in_progress", "wip"].includes(lower)) return "doing";
  if (["blocked", "stuck"].includes(lower)) return "blocked";
  return "todo";
}

function normalizePriority(s: string): string {
  const lower = s.toLowerCase().trim();
  if (["critical", "p0"].includes(lower)) return "critical";
  if (["high", "p1", "urgent"].includes(lower)) return "high";
  if (["low", "p3", "nice to have"].includes(lower)) return "low";
  return "medium";
}

function parseDate(s: string | null | undefined): string | null {
  if (!s || s.trim() === "") return null;
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

// ─── IMPORT SERVICE ────────────────────────────────────────
export const taskImportService = {
  /**
   * Upsert tasks for a project with deduplication
   * 
   * Rules:
   * 1. If external_id is present → upsert on (user_id, project_id, external_id)
   * 2. Else → upsert on (user_id, project_id, dedupe_key)
   */
  async importTasks(projectId: string, tasks: ImportedTask[]): Promise<ImportResult> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      try {
        const title = task.title?.trim();
        if (!title) {
          result.skipped++;
          continue;
        }

        const status = normalizeStatus(task.status || "todo");
        const priority = normalizePriority(task.priority || "medium");
        const startDate = parseDate(task.start_date);
        const dueDate = parseDate(task.due_date);
        const completedDate = parseDate(task.completed_date || task.completed_at);
        const externalId = task.external_id?.trim() || null;
        const dedupe = task.dedupe_key?.trim() || generateDedupe(user.id, projectId, title, startDate, dueDate);
        const sortIndex = task.sort_index ?? i;

        // Look for existing task
        let existing: any = null;

        // Strategy 1: Match by external_id
        if (externalId) {
          const { data } = await supabase
            .from("tasks")
            .select("id")
            .eq("user_id", user.id)
            .eq("project_id", projectId)
            .eq("external_id", externalId)
            .is("deleted_at", null)
            .maybeSingle();
          existing = data;
        }

        // Strategy 2: Match by dedupe_key
        if (!existing && dedupe) {
          const { data } = await supabase
            .from("tasks")
            .select("id")
            .eq("user_id", user.id)
            .eq("project_id", projectId)
            .eq("dedupe_key", dedupe)
            .is("deleted_at", null)
            .maybeSingle();
          existing = data;
        }

        // Strategy 3: Match by original task id (if re-importing same export)
        if (!existing && task.id) {
          const { data } = await supabase
            .from("tasks")
            .select("id")
            .eq("id", task.id)
            .eq("user_id", user.id)
            .eq("project_id", projectId)
            .is("deleted_at", null)
            .maybeSingle();
          existing = data;
        }

        const taskData = {
          title,
          status,
          priority,
          start_date: startDate,
          due_date: dueDate,
          completed_at: status === "done" ? (completedDate ? new Date(completedDate).toISOString() : new Date().toISOString()) : null,
          order_index: sortIndex,
          dedupe_key: dedupe,
          external_id: externalId,
          last_touched_at: new Date().toISOString(),
        };

        if (existing) {
          // Update existing task
          const { error } = await supabase
            .from("tasks")
            .update(taskData)
            .eq("id", existing.id);
          if (error) throw error;
          result.updated++;
        } else {
          // Create new task
          const { error } = await supabase
            .from("tasks")
            .insert({
              ...taskData,
              user_id: user.id,
              project_id: projectId,
            });
          if (error) throw error;
          result.created++;
        }
      } catch (e: any) {
        result.errors.push(`Row ${i + 1} (${task.title || "unknown"}): ${e.message}`);
      }
    }

    return result;
  },

  /**
   * Parse CSV text into ImportedTask array
   */
  parseCSV(text: string): ImportedTask[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());

    const findCol = (keywords: string[]): number => {
      return headers.findIndex(h => keywords.some(k => h.includes(k)));
    };

    // Column mapping
    const cols = {
      id: findCol(["id"]),
      external_id: findCol(["external_id"]),
      dedupe_key: findCol(["dedupe_key", "dedupe"]),
      project_id: findCol(["project_id"]),
      sort_index: findCol(["sort_index", "index", "order"]),
      title: findCol(["title", "name", "task"]),
      status: findCol(["status", "state"]),
      start_date: findCol(["start_date", "start"]),
      due_date: findCol(["due_date", "due", "deadline"]),
      completed_date: findCol(["completed_date", "completed_at", "completed"]),
      priority: findCol(["priority", "prio"]),
    };

    if (cols.title < 0) {
      throw new Error("CSV must have a title/name/task column");
    }

    const tasks: ImportedTask[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVRow(lines[i]);
      const title = row[cols.title]?.trim();
      if (!title) continue;

      tasks.push({
        id: cols.id >= 0 ? row[cols.id] : undefined,
        external_id: cols.external_id >= 0 ? row[cols.external_id] : undefined,
        dedupe_key: cols.dedupe_key >= 0 ? row[cols.dedupe_key] : undefined,
        project_id: cols.project_id >= 0 ? row[cols.project_id] : undefined,
        sort_index: cols.sort_index >= 0 ? parseInt(row[cols.sort_index]) || i : i,
        title,
        status: cols.status >= 0 ? row[cols.status] || "todo" : "todo",
        start_date: cols.start_date >= 0 ? row[cols.start_date] : null,
        due_date: cols.due_date >= 0 ? row[cols.due_date] : null,
        completed_date: cols.completed_date >= 0 ? row[cols.completed_date] : null,
        priority: cols.priority >= 0 ? row[cols.priority] || "medium" : "medium",
      });
    }

    return tasks;
  },

  /**
   * Parse JSON export into ImportedTask array
   */
  parseJSON(text: string): ImportedTask[] {
    const data = JSON.parse(text);
    
    // Handle VantoOS export format
    if (data.export_type === "tasks" && Array.isArray(data.tasks)) {
      return data.tasks;
    }
    
    // Handle raw array
    if (Array.isArray(data)) {
      return data;
    }

    throw new Error("Invalid JSON format. Expected VantoOS export or array of tasks.");
  },
};

/**
 * Parse a single CSV row handling quoted values
 */
function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = false;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}
