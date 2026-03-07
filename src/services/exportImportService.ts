import { supabase } from "@/integrations/supabase/client";

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

function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const header = keys.join(",");
  const lines = rows.map(r =>
    keys.map(k => {
      const v = r[k];
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(",")
  );
  return [header, ...lines].join("\n");
}

function generateDedupe(userId: string, title: string, date: string, projectId: string | null): string {
  const raw = `${userId}|${title.toLowerCase().trim()}|${date}|${projectId ?? ""}`;
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── EXPORT ────────────────────────────────────────────────
async function fetchAll(table: string) {
async function fetchAll(table: string) {
  const q = supabase.from(table as any).select("*") as any;
  const { data, error } = await q.is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const exportService = {
  async exportTasks(format: "csv" | "json" = "json") {
    const rows = await fetchAll("tasks");
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      downloadFile(toCSV(rows), `vantoos_tasks_${ts}.csv`);
    } else {
      downloadFile(JSON.stringify(rows, null, 2), `vantoos_tasks_${ts}.json`, "application/json");
    }
    return rows.length;
  },

  async exportMeetings(format: "csv" | "json" = "json") {
    const rows = await fetchAll("meetings");
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "csv") downloadFile(toCSV(rows), `vantoos_meetings_${ts}.csv`);
    else downloadFile(JSON.stringify(rows, null, 2), `vantoos_meetings_${ts}.json`, "application/json");
    return rows.length;
  },

  async exportReminders(format: "csv" | "json" = "json") {
    const rows = await fetchAll("reminders");
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "csv") downloadFile(toCSV(rows), `vantoos_reminders_${ts}.csv`);
    else downloadFile(JSON.stringify(rows, null, 2), `vantoos_reminders_${ts}.json`, "application/json");
    return rows.length;
  },

  async exportNotes(format: "csv" | "json" = "json") {
    const rows = await fetchAll("notes_daily");
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "csv") downloadFile(toCSV(rows), `vantoos_notes_${ts}.csv`);
    else downloadFile(JSON.stringify(rows, null, 2), `vantoos_notes_${ts}.json`, "application/json");
    return rows.length;
  },

  async exportKnowledge(format: "csv" | "json" = "json") {
    const rows = await fetchAll("knowledge_docs");
    const ts = new Date().toISOString().slice(0, 10);
    if (format === "csv") downloadFile(toCSV(rows), `vantoos_knowledge_${ts}.csv`);
    else downloadFile(JSON.stringify(rows, null, 2), `vantoos_knowledge_${ts}.json`, "application/json");
    return rows.length;
  },

  async exportFullBundle() {
    const [tasks, meetings, reminders, notes, knowledge] = await Promise.all([
      fetchAll("tasks"),
      fetchAll("meetings"),
      fetchAll("reminders"),
      fetchAll("notes_daily"),
      fetchAll("knowledge_docs"),
    ]);
    const bundle = { exported_at: new Date().toISOString(), version: "1.0", tasks, meetings, reminders, notes, knowledge };
    const ts = new Date().toISOString().slice(0, 10);
    downloadFile(JSON.stringify(bundle, null, 2), `vantoos_workspace_${ts}.json`, "application/json");
    return { tasks: tasks.length, meetings: meetings.length, reminders: reminders.length, notes: notes.length, knowledge: knowledge.length };
  },
};

// ─── IMPORT ────────────────────────────────────────────────
interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

async function upsertRows(table: string, rows: Record<string, any>[], titleKey = "title", dateKey = "created_at"): Promise<ImportResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    try {
      const externalId = row.external_id || null;
      const dedupeKey = row.dedupe_key || generateDedupe(user.id, row[titleKey] || "", row[dateKey] || "", row.project_id || null);

      // Remove internal fields
      const { id, user_id, created_at, updated_at, deleted_at, ...cleanRow } = row;

      // Try to find existing by external_id or dedupe_key
      let existing: any = null;
      if (externalId) {
        const q = supabase.from(table as any).select("id") as any;
        const { data } = await q.eq("user_id", user.id).eq("external_id", externalId).is("deleted_at", null).maybeSingle();
        existing = data;
      }
      if (!existing && dedupeKey) {
        const q = supabase.from(table as any).select("id") as any;
        const { data } = await q.eq("user_id", user.id).eq("dedupe_key", dedupeKey).is("deleted_at", null).maybeSingle();
        existing = data;
      }

      if (existing) {
        const q = supabase.from(table as any) as any;
        await q.update({ ...cleanRow, external_id: externalId, dedupe_key: dedupeKey }).eq("id", existing.id);
        result.updated++;
      } else {
        const q = supabase.from(table as any) as any;
        await q.insert({ ...cleanRow, user_id: user.id, external_id: externalId, dedupe_key: dedupeKey });
        result.created++;
      }
    } catch (e: any) {
      result.errors.push(`${row[titleKey] || "unknown"}: ${e.message}`);
    }
  }
  return result;
}

export const importService = {
  async importTasks(rows: Record<string, any>[]) {
    return upsertRows("tasks", rows, "title", "created_at");
  },
  async importMeetings(rows: Record<string, any>[]) {
    return upsertRows("meetings", rows, "title", "start_time");
  },
  async importReminders(rows: Record<string, any>[]) {
    return upsertRows("reminders", rows, "title", "reminder_time");
  },
  async importNotes(rows: Record<string, any>[]) {
    return upsertRows("notes_daily", rows, "note_date", "note_date");
  },
  async importKnowledge(rows: Record<string, any>[]) {
    return upsertRows("knowledge_docs", rows, "title", "created_at");
  },

  async importBundle(bundle: any): Promise<Record<string, ImportResult>> {
    const results: Record<string, ImportResult> = {};
    if (bundle.tasks?.length) results.tasks = await importService.importTasks(bundle.tasks);
    if (bundle.meetings?.length) results.meetings = await importService.importMeetings(bundle.meetings);
    if (bundle.reminders?.length) results.reminders = await importService.importReminders(bundle.reminders);
    if (bundle.notes?.length) results.notes = await importService.importNotes(bundle.notes);
    if (bundle.knowledge?.length) results.knowledge = await importService.importKnowledge(bundle.knowledge);
    return results;
  },

  parseCSV(text: string): Record<string, any>[] {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map(line => {
      const values = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => { obj[h] = values[i] || ""; });
      return obj;
    });
  },

  parseJSON(text: string): Record<string, any>[] | any {
    return JSON.parse(text);
  },
};
