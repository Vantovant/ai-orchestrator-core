import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Check, ListTodo, Bell, ExternalLink, AlertCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { taskService, makeDedupe, type BulkUpsertResult, type BulkUpsertItemResult } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { useQueryClient } from "@tanstack/react-query";
import { WriteReceiptBanner, buildReceipt, type WriteReceiptData } from "@/components/ui/WriteReceipt";

export interface ActionSuggestion {
  type: "task" | "reminder";
  title: string;
  due_at?: string;
  remind_at?: string;
  priority?: string;
  source: string;
  selected?: boolean;
  applyStatus?: "idle" | "queued" | "created" | "merged" | "failed";
  failReason?: string;
  createdId?: string;
  /** Internal tracking key for deterministic result mapping */
  _dedupeKey?: string;
}

interface Props {
  noteContent: string;
  structureJson: Record<string, string>;
  structuredMode: boolean;
  noteDate: string;
  projectId?: string | null;
  noteId?: string | null;
  onApplyComplete?: () => void;
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

export default function ActionExtractor({ noteContent, structureJson, structuredMode, noteDate, projectId, noteId, onApplyComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
  const [applying, setApplying] = useState(false);
  const [receipt, setReceipt] = useState<WriteReceiptData | null>(null);
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
    setReceipt(null);
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
      } else {
        toast.success(`Found ${items.length} actionable item${items.length !== 1 ? "s" : ""} — review and apply.`);
      }
      setSuggestions(items);
    } catch (e: any) {
      toast.error(e.message || "Failed to extract actions — check AI keys in Settings.");
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
    setReceipt(null);

    // Mark all selected as queued
    setSuggestions(prev => prev.map(s =>
      s.selected && s.applyStatus !== "created" && s.applyStatus !== "merged"
        ? { ...s, applyStatus: "queued" as const }
        : s
    ));

    // Build task inserts with dedupe_keys for deterministic mapping
    const taskItems = toApply.filter(s => s.type === "task");
    const reminderItems = toApply.filter(s => s.type === "reminder");

    // Build a stable dedupe map keyed by suggestion title+index (no object mutation)
    const dedupeByTitle = new Map<string, string>();
    const taskInserts = taskItems.map((s, idx) => {
      const dk = makeDedupe(user.id, projectId || null, noteId || null, s.title + "|" + idx);
      dedupeByTitle.set(s.title + "|" + idx, dk);
      return {
        title: s.title,
        priority: priorityMap[s.priority || "P2"] || "medium",
        due_date: s.due_at || null,
        source: "note_extract",
        project_id: projectId || null,
        note_id: noteId || null,
        dedupe_key: dk,
      };
    });

    let taskResult: BulkUpsertResult = { created: [], merged: [], failed: [], items: [] };
    if (taskInserts.length > 0) {
      taskResult = await taskService.bulkUpsert(taskInserts);
    }

    // Build a lookup from dedupe_key → item result
    const taskResultMap = new Map<string, BulkUpsertItemResult>();
    for (const item of taskResult.items) {
      taskResultMap.set(item.dedupe_key, item);
    }

    let reminderCreated = 0;
    const reminderResults = new Map<number, { status: "created" | "failed"; reason?: string }>();
    for (let ri = 0; ri < reminderItems.length; ri++) {
      const s = reminderItems[ri];
      try {
        await reminderService.create({
          title: s.title,
          reminder_time: s.remind_at || new Date().toISOString(),
          project_id: projectId || null,
        });
        reminderCreated++;
        reminderResults.set(ri, { status: "created" });
      } catch (e: any) {
        reminderResults.set(ri, { status: "failed", reason: e.message });
      }
    }

    // Update per-item statuses using deterministic dedupe_key mapping (no object mutation)
    let convergingTaskIdx = 0;
    let convergingReminderIdx = 0;
    const updatedSuggestions = suggestions.map(s => {
      if (!s.selected || s.applyStatus === "created" || s.applyStatus === "merged") return s;

      if (s.type === "task") {
        const tIdx = convergingTaskIdx++;
        const dk = dedupeByTitle.get(s.title + "|" + tIdx);
        const itemResult = dk ? taskResultMap.get(dk) : undefined;
        if (!itemResult) return { ...s, applyStatus: "failed" as const, failReason: "No result returned" };
        return {
          ...s,
          applyStatus: itemResult.status as ActionSuggestion["applyStatus"],
          createdId: itemResult.id,
          failReason: itemResult.reason,
        };
      }

      if (s.type === "reminder") {
        const rIdx = convergingReminderIdx++;
        const rResult = reminderResults.get(rIdx);
        if (!rResult) return { ...s, applyStatus: "failed" as const, failReason: "No result returned" };
        return {
          ...s,
          applyStatus: rResult.status as ActionSuggestion["applyStatus"],
          failReason: rResult.reason,
        };
      }
      return s;
    });

    setSuggestions(updatedSuggestions);

    const totalCreated = taskResult.created.length + reminderCreated;
    const totalMerged = taskResult.merged.length;
    const totalFailed = taskResult.failed.length + (Array.from(reminderResults.values()).filter(r => r.status === "failed").length);
    const allIds = [...taskResult.created, ...taskResult.merged];

    // Post-apply verification: count truly open tasks (not done/completed, not deleted)
    let verificationMsg: string | undefined;
    if (projectId && (totalCreated > 0 || totalMerged > 0)) {
      try {
        const { count, error: countError } = await supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .is("completed_at", null)
          .not("status", "in", '("done","completed","cancelled")');
        if (!countError && count !== null) {
          verificationMsg = `Verified: ${count} open task${count !== 1 ? "s" : ""} now visible in this project`;
        }
      } catch {}
    } else if (!projectId && (totalCreated > 0 || totalMerged > 0)) {
      // Generic receipt without project-specific verification
      verificationMsg = undefined;
    }

    // Build receipt
    const newReceipt = buildReceipt(
      "note_extract",
      totalCreated,
      totalMerged,
      totalFailed,
      allIds,
      noteId || undefined,
    );
    if (verificationMsg) {
      newReceipt.verification_message = verificationMsg;
    }
    setReceipt(newReceipt);

    // Await query invalidation before completing
    try {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["tasks"] }),
        qc.invalidateQueries({ queryKey: ["reminders"] }),
      ]);
    } catch {
      // If refresh fails, downgrade receipt to warning
      if (newReceipt.status === "success") {
        newReceipt.status = "warning";
        newReceipt.summary += " (list refresh pending)";
        setReceipt({ ...newReceipt });
      }
    }

    setApplying(false);

    // Toast
    if (totalCreated === 0 && totalMerged === 0) {
      toast.error(`Apply failed — ${totalFailed} item${totalFailed !== 1 ? "s" : ""} could not be saved.`);
    } else if (totalFailed > 0) {
      toast.warning(`Partially applied — ${totalCreated} created, ${totalMerged} merged, ${totalFailed} failed.`);
    } else {
      toast.success(`Receipt ready — ${totalCreated} created, ${totalMerged} merged.`);
    }

    // Auto-switch to Tasks tab only after refresh is complete
    if ((totalCreated > 0 || totalMerged > 0) && onApplyComplete) {
      onApplyComplete();
    }
  };

  const handleViewInTasks = () => {
    const allIds = receipt?.affected_ids || [];
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

            {/* Receipt banner with optional verification */}
            {receipt && (
              <WriteReceiptBanner
                receipt={receipt}
                onNavigate={handleViewInTasks}
                navigateLabel="View in Tasks →"
              />
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
      case "merged": return <RefreshCw className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />;
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
              <Check className="h-2.5 w-2.5" /> Created
            </Badge>
          )}
          {s.applyStatus === "merged" && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 gap-0.5">
              <RefreshCw className="h-2.5 w-2.5" /> Merged (duplicate-proof)
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
