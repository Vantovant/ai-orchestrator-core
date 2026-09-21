import { supabase } from "@/integrations/supabase/client";

// ── Types ───────────────────────────────────────────────────────────────

export interface WellnessMetric {
  id: string;
  user_id: string;
  recorded_on: string;
  weight_kg: number | null;
  waist_cm: number | null;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  resting_hr: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type WellnessDocCategory = "lab_results" | "consultation" | "imaging" | "prescription" | "other";

export interface WellnessDocument {
  id: string;
  user_id: string;
  title: string;
  category: WellnessDocCategory;
  doctor_name: string | null;
  facility: string | null;
  report_date: string | null;
  notes: string | null;
  file_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WellnessJournalEntry {
  id: string;
  user_id: string;
  entry_date: string;
  mood: string | null;
  energy_level: number | null;
  goal_focus: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── Metrics (weight & vitals) ──────────────────────────────────────────────

export async function getMetrics(limit = 90): Promise<WellnessMetric[]> {
  const { data, error } = await supabase
    .from("wellness_metrics" as any)
    .select("*")
    .is("deleted_at", null)
    .order("recorded_on", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as WellnessMetric[];
}

export async function addMetric(entry: {
  recorded_on?: string;
  weight_kg?: number | null;
  waist_cm?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  resting_hr?: number | null;
  notes?: string | null;
}): Promise<WellnessMetric> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await (supabase.from("wellness_metrics" as any) as any)
    .insert({ user_id: user.id, ...entry })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as WellnessMetric;
}

export async function deleteMetric(id: string): Promise<void> {
  const { error } = await (supabase.from("wellness_metrics" as any) as any)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ── Documents (doctor's reports) ───────────────────────────────────────────

export async function getDocuments(): Promise<WellnessDocument[]> {
  const { data, error } = await supabase
    .from("wellness_documents" as any)
    .select("*")
    .is("deleted_at", null)
    .order("report_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as WellnessDocument[];
}

export async function addDocument(entry: {
  title: string;
  category: WellnessDocCategory;
  doctor_name?: string | null;
  facility?: string | null;
  report_date?: string | null;
  notes?: string | null;
  file?: File | null;
}): Promise<WellnessDocument> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let file_path: string | null = null;
  let file_name: string | null = null;
  let mime_type: string | null = null;
  let size_bytes: number | null = null;

  if (entry.file) {
    const safeFilename = entry.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${Date.now()}_${safeFilename}`;
    const { error: uploadErr } = await supabase.storage
      .from("wellness-documents")
      .upload(storagePath, entry.file, { contentType: entry.file.type, upsert: false });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
    file_path = storagePath;
    file_name = entry.file.name;
    mime_type = entry.file.type || null;
    size_bytes = entry.file.size;
  }

  const { data, error } = await (supabase.from("wellness_documents" as any) as any)
    .insert({
      user_id: user.id,
      title: entry.title,
      category: entry.category,
      doctor_name: entry.doctor_name ?? null,
      facility: entry.facility ?? null,
      report_date: entry.report_date ?? null,
      notes: entry.notes ?? null,
      file_path,
      file_name,
      mime_type,
      size_bytes,
    })
    .select()
    .single();

  if (error) {
    if (file_path) await supabase.storage.from("wellness-documents").remove([file_path]);
    throw error;
  }
  return data as unknown as WellnessDocument;
}

export async function getDocumentDownloadUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("wellness-documents")
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteDocument(id: string, filePath?: string | null): Promise<void> {
  const { error } = await (supabase.from("wellness_documents" as any) as any)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  if (filePath) await supabase.storage.from("wellness-documents").remove([filePath]);
}

// ── Journal ─────────────────────────────────────────────────────────────

export async function getJournalEntries(limit = 100): Promise<WellnessJournalEntry[]> {
  const { data, error } = await supabase
    .from("wellness_journal" as any)
    .select("*")
    .is("deleted_at", null)
    .order("entry_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as WellnessJournalEntry[];
}

export async function addJournalEntry(entry: {
  entry_date?: string;
  mood?: string | null;
  energy_level?: number | null;
  goal_focus?: string | null;
  notes: string;
}): Promise<WellnessJournalEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await (supabase.from("wellness_journal" as any) as any)
    .insert({ user_id: user.id, ...entry })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as WellnessJournalEntry;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { error } = await (supabase.from("wellness_journal" as any) as any)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
