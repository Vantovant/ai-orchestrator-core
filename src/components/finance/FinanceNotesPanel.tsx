import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { financeNoteService } from "@/services/budgetService";
import { supabase } from "@/integrations/supabase/client";
import { budgetItemService } from "@/services/budgetService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { StickyNote, Mic, MicOff, Zap, Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useDictation } from "@/hooks/useDictation";

type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface Suggestion {
  actionType: string;
  targetTab: string;
  payload: any;
  confidence: number;
  _applied?: boolean;
}

export default function FinanceNotesPanel() {
  const qc = useQueryClient();
  const now = new Date();
  const [noteMonth, setNoteMonth] = useState(format(now, "yyyy-MM"));
  const [content, setContentRaw] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);

  const contentRef = useRef(content);
  contentRef.current = content;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const savingRef = useRef(false);
  const autosaveRef = useRef<ReturnType<typeof setTimeout>>();

  const noteQuery = useQuery({
    queryKey: ["finance-note", noteMonth],
    queryFn: () => financeNoteService.getByMonth(noteMonth),
  });

  // Sync from query
  useEffect(() => {
    if (noteQuery.data) {
      setContentRaw(noteQuery.data.content);
      setLastSavedAt(format(new Date(noteQuery.data.updated_at), "HH:mm"));
      setDirty(false);
      setSaveStatus("idle");
    } else if (!noteQuery.isLoading) {
      setContentRaw("");
      setDirty(false);
    }
    setSuggestions([]); setSelected(new Set());
  }, [noteQuery.data, noteQuery.isLoading, noteMonth]);

  // Save
  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveStatus("saving");
    try {
      if (!navigator.onLine) { setSaveStatus("offline"); setDirty(false); return; }
      await financeNoteService.upsert(noteMonth, contentRef.current);
      qc.invalidateQueries({ queryKey: ["finance-note", noteMonth] });
      setDirty(false);
      setSaveStatus("saved");
      setLastSavedAt(format(new Date(), "HH:mm"));
    } catch {
      setSaveStatus("error");
      toast.error("Save failed");
    } finally {
      savingRef.current = false;
    }
  }, [noteMonth, qc]);

  const triggerAutosave = useCallback(() => {
    if (autosaveRef.current) clearTimeout(autosaveRef.current);
    autosaveRef.current = setTimeout(() => save(), 1500);
  }, [save]);

  const setContent = useCallback((val: string) => {
    setContentRaw(val);
    setDirty(true);
    setSaveStatus("idle");
    triggerAutosave();
  }, [triggerAutosave]);

  // Dictation
  const { state: dictState, supported: dictSupported, interimText, start: dictStart, stop: dictStop } = useDictation({
    onTranscript: (text) => {
      setContent(contentRef.current + (contentRef.current ? " " : "") + text);
    },
  });

  // Realtime sync
  useEffect(() => {
    const channel = supabase
      .channel(`finance-notes-${noteMonth}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "finance_notes", filter: `note_month=eq.${noteMonth}` }, () => {
        if (!dirtyRef.current) qc.invalidateQueries({ queryKey: ["finance-note", noteMonth] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [noteMonth, qc]);

  // Focus refetch
  useEffect(() => {
    const h = () => { if (!dirtyRef.current) qc.invalidateQueries({ queryKey: ["finance-note", noteMonth] }); };
    window.addEventListener("focus", h);
    return () => window.removeEventListener("focus", h);
  }, [noteMonth, qc]);

  // Online sync
  useEffect(() => {
    const h = () => { if (dirtyRef.current) save(); };
    window.addEventListener("online", h);
    return () => window.removeEventListener("online", h);
  }, [save]);

  useEffect(() => () => { if (autosaveRef.current) clearTimeout(autosaveRef.current); }, []);

  // Extract & Route
  const handleExtract = async () => {
    if (!content.trim()) { toast.info("Write or dictate some notes first"); return; }
    setExtracting(true);
    setSuggestions([]);
    try {
      const items = await budgetItemService.list();
      const context = { month: noteMonth, budget_summary: items.slice(0, 10).map((i) => `${i.name} ${i.amount} ${i.cadence}`) };
      const { data, error } = await supabase.functions.invoke("finance-ai-route", {
        body: { content: content.slice(0, 3000), context },
      });
      if (error) throw error;
      const s = data?.suggestions ?? [];
      setSuggestions(s);
      setSelected(new Set(s.map((_: any, i: number) => i)));
      if (s.length === 0) toast.info("No actions found in notes");
    } catch (e: any) {
      toast.error(e.message || "Extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  // Apply
  const handleApply = async () => {
    if (selected.size === 0) { toast.info("Select actions to apply"); return; }
    setApplying(true);
    let created = 0;
    for (const idx of selected) {
      const s = suggestions[idx];
      if (s._applied) continue;
      try {
        if (s.actionType === "create_budget_item") {
          await budgetItemService.create(s.payload);
          created++;
        }
        // Future: handle other action types
        s._applied = true;
      } catch (e: any) {
        toast.error(`Failed: ${s.payload?.name ?? "item"}`);
      }
    }
    setSuggestions([...suggestions]);
    if (created > 0) {
      qc.invalidateQueries({ queryKey: ["budget_items"] });
      toast.success(`Created ${created} item(s) ✓`);
    }
    setApplying(false);
  };

  const toggleSelect = (idx: number) => {
    const ns = new Set(selected);
    if (ns.has(idx)) ns.delete(idx); else ns.add(idx);
    setSelected(ns);
  };

  const statusLabel = saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? `Saved ${lastSavedAt}` : saveStatus === "error" ? "Error" : saveStatus === "offline" ? "Offline" : dirty ? "Unsaved" : lastSavedAt ? `Saved ${lastSavedAt}` : "";
  const statusVariant = saveStatus === "saved" ? "default" as const : saveStatus === "error" ? "destructive" as const : "secondary" as const;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1"><StickyNote className="h-4 w-4" /> Notes</Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Finance Notes — {format(new Date(noteMonth + "-01"), "MMM yyyy")}</span>
            {statusLabel && <Badge variant={statusVariant} className="text-xs">{statusLabel}</Badge>}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Dictation */}
          <div className="flex items-center gap-2">
            {dictSupported && (
              <Button variant={dictState === "listening" ? "destructive" : "outline"} size="sm" className="gap-1" onClick={dictState === "listening" ? dictStop : dictStart}>
                {dictState === "listening" ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {dictState === "listening" ? "Stop" : "Dictate"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1" onClick={save} disabled={!dirty}><Save className="h-4 w-4" /> Save</Button>
          </div>

          {interimText && <p className="text-xs text-muted-foreground italic animate-pulse">…{interimText}</p>}

          {/* Note area */}
          {noteQuery.isLoading ? <Skeleton className="h-40" /> : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Dictate or type finance notes… e.g. 'Add instalment: Car R2500 every 15th for Toyota'"
              className="min-h-[200px] text-sm"
            />
          )}

          {/* Extract */}
          <Button onClick={handleExtract} disabled={extracting} className="w-full gap-2">
            {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {extracting ? "Extracting…" : "Extract & Route"}
          </Button>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Suggested Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {suggestions.map((s, i) => (
                  <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 ${s._applied ? "bg-muted/50 opacity-60" : ""}`}>
                    <Checkbox checked={selected.has(i)} onCheckedChange={() => toggleSelect(i)} disabled={s._applied} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{s.actionType.replace(/_/g, " ")}</Badge>
                        <Badge variant="secondary" className="text-xs">→ {s.targetTab}</Badge>
                        {s._applied && <Badge className="text-xs gap-1"><Check className="h-3 w-3" /> Created</Badge>}
                      </div>
                      <p className="text-sm font-medium mt-1">{s.payload?.name || s.payload?.title || JSON.stringify(s.payload).slice(0, 80)}</p>
                      {s.payload?.amount && <p className="text-xs text-muted-foreground">R {s.payload.amount} · {s.payload?.cadence || ""}</p>}
                    </div>
                  </div>
                ))}
                <Button onClick={handleApply} disabled={applying || selected.size === 0} className="w-full gap-2">
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Apply Selected ({selected.size})
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
