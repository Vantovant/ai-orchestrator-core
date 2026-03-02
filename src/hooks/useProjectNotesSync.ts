import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { projectNotesService } from "@/services/projectService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

const DRAFT_KEY = (projectId: string, date: string) => `project_notes_draft_${projectId}_${date}`;

export function useProjectNotesSync(projectId: string, selectedDate: string) {
  const [content, setContentRaw] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const qc = useQueryClient();
  const autosaveRef = useRef<ReturnType<typeof setTimeout>>();
  const savingRef = useRef(false);

  const contentRef = useRef(content);
  const dirtyRef = useRef(dirty);
  contentRef.current = content;
  dirtyRef.current = dirty;

  const noteQuery = useQuery({
    queryKey: ["project_note", projectId, selectedDate],
    queryFn: () => projectNotesService.getByDate(projectId, selectedDate),
  });

  // Sync state from query result
  useEffect(() => {
    if (noteQuery.data) {
      setContentRaw(noteQuery.data.content);
      setLastSavedAt(format(new Date(noteQuery.data.updated_at), "HH:mm"));
      localStorage.removeItem(DRAFT_KEY(projectId, selectedDate));
    } else if (!noteQuery.isLoading) {
      try {
        const draft = localStorage.getItem(DRAFT_KEY(projectId, selectedDate));
        if (draft) {
          const p = JSON.parse(draft);
          setContentRaw(p.content || "");
          setDirty(true);
          toast.info("Loaded local draft");
          return;
        }
      } catch {}
      setContentRaw("");
    }
    setDirty(false);
    setSaveStatus("idle");
  }, [noteQuery.data, noteQuery.isLoading, projectId, selectedDate]);

  // Core save
  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      if (!navigator.onLine) {
        localStorage.setItem(DRAFT_KEY(projectId, selectedDate), JSON.stringify({ content: contentRef.current }));
        setSaveStatus("offline");
        setDirty(false);
        return;
      }
      await projectNotesService.upsert(projectId, selectedDate, contentRef.current);
      qc.invalidateQueries({ queryKey: ["project_note", projectId, selectedDate] });
      setDirty(false);
      setSaveStatus("saved");
      setLastSavedAt(format(new Date(), "HH:mm"));
      localStorage.removeItem(DRAFT_KEY(projectId, selectedDate));
    } catch {
      setSaveStatus("error");
      localStorage.setItem(DRAFT_KEY(projectId, selectedDate), JSON.stringify({ content: contentRef.current }));
      toast.error("Save failed — draft saved locally");
    } finally {
      savingRef.current = false;
    }
  }, [projectId, selectedDate, qc]);

  // Debounced autosave
  const triggerAutosave = useCallback(() => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => save(), 1500);
  }, [save]);

  // Wrapped setter
  const setContent = useCallback((val: string | ((prev: string) => string)) => {
    setContentRaw(prev => typeof val === "function" ? val(prev) : val);
    setDirty(true);
    setSaveStatus("idle");
    triggerAutosave();
  }, [triggerAutosave]);

  // Refetch on focus
  useEffect(() => {
    const handleFocus = () => {
      if (!dirtyRef.current) {
        qc.invalidateQueries({ queryKey: ["project_note", projectId, selectedDate] });
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [projectId, selectedDate, qc]);

  // Auto-sync when online
  useEffect(() => {
    const handleOnline = () => {
      if (dirtyRef.current) save();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [save]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`project-notes-${projectId}-${selectedDate}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'project_notes',
        filter: `project_id=eq.${projectId}`,
      }, () => {
        if (!dirtyRef.current) {
          qc.invalidateQueries({ queryKey: ["project_note", projectId, selectedDate] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, selectedDate, qc]);

  // Cleanup
  useEffect(() => () => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
  }, []);

  return {
    isLoading: noteQuery.isLoading,
    content,
    setContent,
    dirty,
    saveStatus,
    lastSavedAt,
    save,
  };
}
