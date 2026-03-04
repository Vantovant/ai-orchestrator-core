import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Check, ListTodo, Bell, ExternalLink, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { taskService, makeDedupe, type BulkUpsertResult } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { useQueryClient } from "@tanstack/react-query";

export interface ActionSuggestion {
  type: "task" | "reminder";
  title: string;
  due_at?: string;
  remind_at?: string;
  priority?: string;
  source: string;
  selected?: boolean;
  /** per-item apply status */
  applyStatus?: "idle" | "queued" | "created" | "merged" | "failed";
  failReason?: string;
  createdId?: string;
}

interface Props {
  noteContent: string;
  structureJson: Record<string, string>;
  structuredMode: boolean;
  noteDate: string;
  projectId?: string | null;
  noteId?: string | null;
}

function buildNoteText(content: string, structureJson: Record<string, string>, structuredMode: boolean): string {
  let text = "";
  if (structuredMode) {
    for (const [key, val] of Object.entries(structureJson)) {
      if (val) text += `${key}: ${val}\n`;
    }
    text += "\n";
  }
  text += content;
  return text.slice(0, 3000);
}

const priorityMap: Record<string, string> = { P1: "high", P2: "medium", P3: "low" };

export default function ActionExtractor({ noteContent, structureJson, structuredMode, noteDate, projectId, noteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
  const [applying, setApplying] = useState(false);
  const [lastResult, setLastResult] = useState<BulkUpsertResult | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const handleExtract = async () => {
    const text = buildNoteText(noteContent, structureJson, structuredMode);
    if (!text.trim()) {
      toast.info("Write some notes first before extracting actions.");
      return;
    }
    setLoading(true);
    setSuggestions([]);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("plan-ai-extract-actions", {
        body: { content: text, note_date: noteDate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const items = (data?.suggestions || []).map((s: ActionSuggestion) => ({
        ...s,
        selected: true,
        applyStatus: "idle" as const,
      }));
      if (items.length === 0) {
        toast.info("No actionable items found in these notes.");
      }
      setSuggestions(items);
    } catch (e: any) {
      toast.error(e.message || "Failed to extract actions");
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (idx: number) => {
    setSuggestions(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
  };

  const handleApply = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not authenticated"); return; }

    const toApply = suggestions.filter(s => s.selected && s.applyStatus !== "created" && s.applyStatus !== "merged");
    if (toApply.length === 0) { toast.info("No items selected."); return; }

    setApplying(true);

    // Mark all selected as queued
    setSuggestions(prev => prev.map(s =>
      s.selected && s.applyStatus !== "created" && s.applyStatus !== "merged"
        ? { ...s, applyStatus: "queued" as const }
        : s
    ));

    // Separate tasks and reminders
    const taskItems = toApply.filter(s => s.type === "task");
    const reminderItems = toApply.filter(s => s.type === "reminder");

    // Build task inserts with dedupe keys
    const taskInserts = taskItems.map(s => ({
      title: s.title,
      priority: priorityMap[s.priority || "P2"] || "medium",
      due_date: s.due_at || null,
      source: "note_extract",
      project_id: projectId || null,
      note_id: noteId || null,
      dedupe_key: makeDedupe(user.id, projectId || null, noteId || null, s.title),
    }));

    let taskResult: BulkUpsertResult = { created: [], merged: [], failed: [] };
    if (taskInserts.length > 0) {
      taskResult = await taskService.bulkUpsert(taskInserts);
    }

    // Handle reminders (no dedupe for now, just create)
    let reminderCreated = 0;
    let reminderFailed: { title: string; reason: string }[] = [];
    for (const s of reminderItems) {
      try {
        await reminderService.create({
          title: s.title,
          reminder_time: s.remind_at || new Date().toISOString(),
        });
        reminderCreated++;
      } catch (e: any) {
        reminderFailed.push({ title: s.title, reason: e.message });
      }
    }

    // Update suggestion statuses
    const updatedSuggestions = suggestions.map(s => {
      if (!s.selected || s.applyStatus === "created" || s.applyStatus === "merged") return s;

      if (s.type === "task") {
        const dedupeKey = makeDedupe(user.id, projectId || null, noteId || null, s.title);
        const taskIdx = taskInserts.findIndex(t => t.dedupe_key === dedupeKey);
        if (taskIdx === -1) return s;

        // Check if this task was created, merged, or failed
        let createdIdx = 0;
        let mergedIdx = 0;
        let failedIdx = 0;
        for (let i = 0; i <= taskIdx; i++) {
          const dk = taskInserts[i].dedupe_key;
          if (taskResult.created.length > createdIdx && i === taskInserts.findIndex((_, j) => j === i)) {
            // simplified: map by order
          }
        }

        // Simpler approach: match by title
        const failedItem = taskResult.failed.find(f => f.title === s.title);
        if (failedItem) {
          return { ...s, applyStatus: "failed" as const, failReason: failedItem.reason };
        }
        // Check created vs merged by index tracking
        const insertIndex = taskInserts.findIndex(t => t.title === s.title);
        if (insertIndex !== -1) {
          // Count how many before this were created/merged/failed
          let cIdx = 0, mIdx = 0, fIdx = 0;
          for (let i = 0; i < taskInserts.length; i++) {
            const fi = taskResult.failed.find(f => f.title === taskInserts[i].title);
            if (fi) { fIdx++; continue; }
            if (i === insertIndex) {
              // This one is either created or merged
              const remainCreated = taskResult.created.length - cIdx;
              if (remainCreated > 0) {
                return { ...s, applyStatus: "created" as const, createdId: taskResult.created[cIdx] };
              } else {
                return { ...s, applyStatus: "merged" as const, createdId: taskResult.merged[mIdx] };
              }
            }
            // Count
            if (cIdx < taskResult.created.length) cIdx++;
            else mIdx++;
          }
        }
        return { ...s, applyStatus: "created" as const };
      }

      if (s.type === "reminder") {
        const fi = reminderFailed.find(f => f.title === s.title);
        if (fi) return { ...s, applyStatus: "failed" as const, failReason: fi.reason };
        return { ...s, applyStatus: "created" as const };
      }
      return s;
    });

    setSuggestions(updatedSuggestions);
    setLastResult(taskResult);
    setApplying(false);

    // Invalidate tasks query
    qc.invalidateQueries({ queryKey: ["tasks"] });

    // Toast with breakdown
    const totalCreated = taskResult.created.length + reminderCreated;
    const totalMerged = taskResult.merged.length;
    const totalFailed = taskResult.failed.length + reminderFailed.length;

    if (totalFailed > 0) {
      toast.error(`Applied: ${totalCreated} created, ${totalMerged} merged, ${totalFailed} failed`);
    } else {
      toast.success(`Applied to Tasks — ${totalCreated} created, ${totalMerged} merged`);
    }
  };

  const handleViewInTasks = () => {
    const allIds = [
      ...(lastResult?.created || []),
      ...(lastResult?.merged || []),
    ];
    const params = new URLSearchParams();
    params.set("tab", "tasks");
    if (projectId) params.set("project_id", projectId);
    if (allIds.length > 0) params.set("highlight", allIds.join(","));
    params.set("source", "note_extract");
    params.set("note_date", noteDate);
    navigate(`/plan?${params.toString()}`);
  };

  const selectedCount = suggestions.filter(s => s.selected && s.applyStatus !== "created" && s.applyStatus !== "merged").length;
  const hasResults = suggestions.length > 0;
  const hasApplied = suggestions.some(s => s.applyStatus === "created" || s.applyStatus === "merged");

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1 w-full"
        onClick={handleExtract}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Extracting actions…" : "Extract Actions"}
      </Button>

      {hasResults && (
        <Card className="border-primary/20">
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} found — review and apply:
            </p>
            <div className="space-y-1.5">
              {suggestions.map((s, idx) => (
                <ActionRow key={idx} suggestion={s} idx={idx} onToggle={toggleSelection} applying={applying} />
              ))}
            </div>

            {selectedCount > 0 && (
              <Button
                size="sm"
                className="w-full gap-1"
                onClick={handleApply}
                disabled={applying}
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {applying ? "Applying…" : `Apply ${selectedCount} Selected`}
              </Button>
            )}

            {hasApplied && (
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1"
                onClick={handleViewInTasks}
              >
                <ExternalLink className="h-4 w-4" />
                View in Tasks →
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActionRow({ suggestion: s, idx, onToggle, applying }: {
  suggestion: ActionSuggestion;
  idx: number;
  onToggle: (idx: number) => void;
  applying: boolean;
}) {
  const statusIcon = () => {
    switch (s.applyStatus) {
      case "queued": return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5 shrink-0" />;
      case "created": return <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />;
      case "merged": return <RefreshCw className="h-4 w-4 text-warning mt-0.5 shrink-0" />;
      case "failed": return <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />;
      default: return (
        <Checkbox
          checked={s.selected}
          onCheckedChange={() => onToggle(idx)}
          className="mt-0.5"
          disabled={applying}
        />
      );
    }
  };

  const isDone = s.applyStatus === "created" || s.applyStatus === "merged";

  return (
    <label
      className={`flex items-start gap-2 p-2 rounded-md border text-sm cursor-pointer transition-colors ${
        s.applyStatus === "failed"
          ? "bg-destructive/5 border-destructive/30"
          : isDone
          ? "bg-primary/5 border-primary/30"
          : s.applyStatus === "queued"
          ? "bg-muted/50 border-muted"
          : s.selected
          ? "bg-accent/50 border-accent"
          : "bg-background border-border"
      }`}
    >
      {statusIcon()}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {s.type === "task" ? (
            <ListTodo className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className={isDone ? "line-through text-muted-foreground" : ""}>
            {s.title}
          </span>
        </div>
        <div className="flex gap-1.5 mt-1 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-1 py-0">{s.type}</Badge>
          {s.priority && (
            <Badge variant={s.priority === "P1" ? "destructive" : "secondary"} className="text-[10px] px-1 py-0">
              {s.priority}
            </Badge>
          )}
          {(s.due_at || s.remind_at) && (
            <span className="text-[10px] text-muted-foreground">{s.due_at || s.remind_at}</span>
          )}
          {s.applyStatus === "created" && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 gap-0.5">
              <Check className="h-2.5 w-2.5" /> Added to Tasks
            </Badge>
          )}
          {s.applyStatus === "merged" && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 gap-0.5">
              <RefreshCw className="h-2.5 w-2.5" /> Merged
            </Badge>
          )}
          {s.applyStatus === "queued" && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0">Queued…</Badge>
          )}
          {s.applyStatus === "failed" && (
            <Badge variant="destructive" className="text-[10px] px-1 py-0 gap-0.5">
              <AlertCircle className="h-2.5 w-2.5" /> {s.failReason || "Failed"}
            </Badge>
          )}
        </div>
      </div>
    </label>
  );
}
