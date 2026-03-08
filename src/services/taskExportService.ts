import { supabase } from "@/integrations/supabase/client";
import { projectService } from "./projectService";

// ─── TYPES ─────────────────────────────────────────────────
export interface ExportedTask {
  id: string;
  external_id: string | null;
  dedupe_key: string;
  project_id: string;
  sort_index: number;
  title: string;
  status: "todo" | "done";
  start_date: string | null;
  due_date: string | null;
  completed_date: string | null;
  priority: "low" | "medium" | "high" | "critical";
  created_at: string;
  updated_at: string;
}

export interface TaskExportJSON {
  export_type: "tasks";
  app: "VantoOS";
  version: "1.0";
  project_id: string;
  project_name: string;
  exported_at: string;
  tasks: ExportedTask[];
}

// ─── HELPERS ───────────────────────────────────────────────
function downloadFile(content: string, filename: string, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "";
  try {
    return isoDate.split("T")[0]; // YYYY-MM-DD
  } catch {
    return "";
  }
}

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/** Generate a stable dedupe key for export compatibility */
function generateDedupe(userId: string, projectId: string, title: string, startDate: string | null, dueDate: string | null): string {
  const normalized = title.toLowerCase().replace(/\s+/g, " ").trim();
  const raw = `${userId}|${projectId}|${normalized}|${startDate || ""}|${dueDate || ""}`;
  // Simple hash – djb2
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/** Normalize status to export format */
function normalizeStatus(status: string): "todo" | "done" {
  if (["done", "complete", "completed"].includes(status.toLowerCase())) {
    return "done";
  }
  return "todo";
}

/** Normalize priority to export format */
function normalizePriority(priority: string): "low" | "medium" | "high" | "critical" {
  const p = priority.toLowerCase();
  if (["critical", "p0"].includes(p)) return "critical";
  if (["high", "p1", "urgent"].includes(p)) return "high";
  if (["low", "p3"].includes(p)) return "low";
  return "medium";
}

// ─── EXPORT SERVICE ────────────────────────────────────────
export const taskExportService = {
  /**
   * Export tasks for a project in specified format
   */
  async exportTasks(projectId: string, format: "csv" | "json"): Promise<{ count: number; filename: string }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Fetch project
    const project = await projectService.get(projectId);
    if (!project) throw new Error("Project not found");

    // Fetch tasks ordered by order_index, then last_touched_at
    const { data: tasks, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("order_index", { ascending: true })
      .order("last_touched_at", { ascending: false });

    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];
    const projectSlug = sanitizeFilename(project.name);

    // Map tasks to export format
    const exportedTasks: ExportedTask[] = (tasks || []).map((t, index) => ({
      id: t.id,
      external_id: (t as any).external_id || null,
      dedupe_key: t.dedupe_key || generateDedupe(user.id, projectId, t.title, t.start_date, t.due_date),
      project_id: projectId,
      sort_index: index,
      title: t.title,
      status: normalizeStatus(t.status),
      start_date: formatDate(t.start_date),
      due_date: formatDate(t.due_date),
      completed_date: formatDate(t.completed_at),
      priority: normalizePriority(t.priority),
      created_at: t.created_at,
      updated_at: t.updated_at,
    }));

    if (format === "json") {
      const payload: TaskExportJSON = {
        export_type: "tasks",
        app: "VantoOS",
        version: "1.0",
        project_id: projectId,
        project_name: project.name,
        exported_at: new Date().toISOString(),
        tasks: exportedTasks,
      };
      const filename = `tasks_${projectSlug}_${today}.json`;
      downloadFile(JSON.stringify(payload, null, 2), filename, "application/json");
      return { count: exportedTasks.length, filename };
    } else {
      // CSV format
      const headers = [
        "id", "external_id", "dedupe_key", "project_id", "sort_index",
        "title", "status", "start_date", "due_date", "completed_date",
        "priority", "created_at", "updated_at"
      ];
      const rows = exportedTasks.map(t => [
        escapeCSV(t.id),
        escapeCSV(t.external_id),
        escapeCSV(t.dedupe_key),
        escapeCSV(t.project_id),
        String(t.sort_index),
        escapeCSV(t.title),
        escapeCSV(t.status),
        escapeCSV(t.start_date),
        escapeCSV(t.due_date),
        escapeCSV(t.completed_date),
        escapeCSV(t.priority),
        escapeCSV(t.created_at),
        escapeCSV(t.updated_at),
      ].join(","));

      const csv = [headers.join(","), ...rows].join("\n");
      const filename = `tasks_${projectSlug}_${today}.csv`;
      downloadFile(csv, filename);
      return { count: exportedTasks.length, filename };
    }
  },
};
