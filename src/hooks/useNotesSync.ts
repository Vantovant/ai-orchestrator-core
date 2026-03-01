import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { notesService, type DailyNote } from "@/services/notesService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

const DRAFT_KEY = (date: string) => `notes_draft_${date}`;

export function useNotesSync(selectedDate: string) {
  const [content, setContentRaw] = useState("");
  const [structuredMode, setStructuredModeRaw] = useState(false);
  const [structureJson, setStructureJsonRaw] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const qc = useQueryClient();
  const autosaveRef = useRef<ReturnType<typeof setTimeout>>();
  const savingRef = useRef(false);

  // Refs so save() always reads latest values
  const contentRef = useRef(content);
  const structuredModeRef = useRef(structuredMode);
  const structureJsonRef = useRef(structureJson);
  const dirtyRef = useRef(dirty);
  contentRef.current = content;
  structuredModeRef.current = structuredMode;
  structureJsonRef.current = structureJson;
  dirtyRef.current = dirty;

  const noteQuery = useQuery({
    queryKey: ["daily-note", selectedDate],
    queryFn: () => notesService.getByDate(selectedDate),
  });

  // Sync state from query result
  useEffect(() => {
    if (noteQuery.data) {
      setContentRaw(noteQuery.data.content);
      setStructuredModeRaw(noteQuery.data.structured_mode);
      setStructureJsonRaw(noteQuery.data.structure_json ?? {});
      setLastSavedAt(format(new Date(noteQuery.data.updated_at), "HH:mm"));
      localStorage.removeItem(DRAFT_KEY(selectedDate));
    } else if (!noteQuery.isLoading) {
      // Check local draft
      try {
        const draft = localStorage.getItem(DRAFT_KEY(selectedDate));
        if (draft) {
          const p = JSON.parse(draft);
          setContentRaw(p.content || "");
          setStructuredModeRaw(p.structuredMode || false);
          setStructureJsonRaw(p.structureJson || {});
          setDirty(true);
          toast.info("Loaded local draft");
          return;
        }
      } catch {}
      setContentRaw("");
      setStructuredModeRaw(false);
      setStructureJsonRaw({});
    }
    setDirty(false);
    setSaveStatus("idle");
  }, [noteQuery.data, noteQuery.isLoading, selectedDate]);

  // Core save — uses refs to read latest values
  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      if (!navigator.onLine) {
        localStorage.setItem(DRAFT_KEY(selectedDate), JSON.stringify({
          content: contentRef.current,
          structuredMode: structuredModeRef.current,
          structureJson: structureJsonRef.current,
        }));
        setSaveStatus("offline");
        setDirty(false);
        return;
      }
      await notesService.upsert(
        selectedDate,
        contentRef.current,
        structuredModeRef.current,
        structureJsonRef.current
      );
      qc.invalidateQueries({ queryKey: ["daily-note", selectedDate] });
      setDirty(false);
      setSaveStatus("saved");
      setLastSavedAt(format(new Date(), "HH:mm"));
      localStorage.removeItem(DRAFT_KEY(selectedDate));
    } catch {
      setSaveStatus("error");
      localStorage.setItem(DRAFT_KEY(selectedDate), JSON.stringify({
        content: contentRef.current,
        structuredMode: structuredModeRef.current,
        structureJson: structureJsonRef.current,
      }));
      toast.error("Save failed — draft saved locally");
    } finally {
      savingRef.current = false;
    }
  }, [selectedDate, qc]);

  // Debounced autosave trigger
  const triggerAutosave = useCallback(() => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => save(), 1500);
  }, [save]);

  // Wrapped setters — mark dirty + trigger autosave
  const setContent = useCallback((val: string | ((prev: string) => string)) => {
    setContentRaw(prev => typeof val === "function" ? val(prev) : val);
    setDirty(true);
    setSaveStatus("idle");
    triggerAutosave();
  }, [triggerAutosave]);

  const setStructuredMode = useCallback((val: boolean) => {
    setStructuredModeRaw(val);
    setDirty(true);
    triggerAutosave();
  }, [triggerAutosave]);

  const setStructureJson = useCallback((val: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => {
    setStructureJsonRaw(prev => typeof val === "function" ? val(prev) : val);
    setDirty(true);
    triggerAutosave();
  }, [triggerAutosave]);

  // Refetch on window focus (cross-device sync fallback)
  useEffect(() => {
    const handleFocus = () => {
      if (!dirtyRef.current) {
        qc.invalidateQueries({ queryKey: ["daily-note", selectedDate] });
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [selectedDate, qc]);

  // Auto-sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      if (dirtyRef.current) save();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [save]);

  // Realtime subscription for cross-device sync
  useEffect(() => {
    const channel = supabase
      .channel(`notes-${selectedDate}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notes_daily',
        filter: `note_date=eq.${selectedDate}`,
      }, () => {
        if (!dirtyRef.current) {
          qc.invalidateQueries({ queryKey: ["daily-note", selectedDate] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDate, qc]);

  // Cleanup autosave timer
  useEffect(() => () => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
  }, []);

  return {
    isLoading: noteQuery.isLoading,
    content,
    setContent,
    structuredMode,
    setStructuredMode,
    structureJson,
    setStructureJson,
    dirty,
    saveStatus,
    lastSavedAt,
    save,
  };
}
