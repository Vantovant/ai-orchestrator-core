import { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BookOpen, Save, ChevronLeft, ChevronRight, Copy, Sparkles, Loader2, ChevronDown, Check, AlertCircle, WifiOff } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { toast } from "sonner";
import { STRUCTURE_FIELDS, STRUCTURE_LABELS, type StructureField } from "@/services/notesService";
import { secretaryService } from "@/services/secretaryService";
import DictationMic from "@/components/plan/DictationMic";
import { useNotesSync, type SaveStatus } from "@/hooks/useNotesSync";

interface Props {
  secretaryMode: boolean;
}

function SaveStatusBadge({ status, lastSavedAt, onRetry }: { status: SaveStatus; lastSavedAt: string | null; onRetry: () => void }) {
  switch (status) {
    case "saving":
      return <Badge variant="secondary" className="gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" />Saving…</Badge>;
    case "saved":
      return <Badge variant="secondary" className="gap-1 text-xs"><Check className="h-3 w-3 text-primary" />Saved {lastSavedAt && `at ${lastSavedAt}`}</Badge>;
    case "error":
      return <Badge variant="destructive" className="gap-1 text-xs cursor-pointer" onClick={onRetry}><AlertCircle className="h-3 w-3" />Retry</Badge>;
    case "offline":
      return <Badge variant="outline" className="gap-1 text-xs"><WifiOff className="h-3 w-3" />Offline — saved locally</Badge>;
    default:
      return null;
  }
}

export default function NotesTab({ secretaryMode }: Props) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [eodLoading, setEodLoading] = useState(false);
  const [eodData, setEodData] = useState<any>(null);

  const {
    isLoading, content, setContent, structuredMode, setStructuredMode,
    structureJson, setStructureJson, dirty, saveStatus, lastSavedAt, save,
  } = useNotesSync(selectedDate);

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  // Dictation handlers
  const lastDictationRef = useRef<string | null>(null);

  const handleDictationAppend = useCallback((text: string) => {
    lastDictationRef.current = text;
    if (structuredMode) {
      setStructureJson((prev) => ({
        ...prev,
        followups: prev.followups ? `${prev.followups} ${text}` : text,
      }));
    } else {
      setContent(prev => {
        if (!prev) return text;
        return prev.endsWith(" ") ? `${prev}${text}` : `${prev} ${text}`;
      });
    }
  }, [structuredMode, setStructureJson, setContent]);

  const handleDictationUndo = useCallback(() => {
    const last = lastDictationRef.current;
    if (!last) return;
    if (structuredMode) {
      setStructureJson((prev) => {
        const updated = { ...prev };
        if (updated.followups?.endsWith(last)) {
          updated.followups = updated.followups.slice(0, -(last.length)).replace(/ $/, "");
        }
        return updated;
      });
    } else {
      setContent(prev => {
        if (prev.endsWith(last)) {
          return prev.slice(0, -(last.length)).replace(/ $/, "");
        }
        return prev;
      });
    }
    lastDictationRef.current = null;
    toast.info("Dictation undone");
  }, [structuredMode, setStructureJson, setContent]);

  const handleCopy = () => {
    let text = `📓 Notes — ${format(new Date(selectedDate), "EEEE, MMM d yyyy")}\n\n`;
    if (structuredMode) {
      STRUCTURE_FIELDS.forEach((f) => {
        if (structureJson[f]) text += `${STRUCTURE_LABELS[f]}\n${structureJson[f]}\n\n`;
      });
    }
    if (content) text += content;
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const handleEodReview = async () => {
    setEodLoading(true);
    try {
      const result = await secretaryService.runEodReview(selectedDate);
      setEodData(result);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate review");
    } finally {
      setEodLoading(false);
    }
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setEodData(null);
  };

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleDateChange(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <h2 className="text-lg font-semibold">{format(new Date(selectedDate), "EEEE, MMM d")}</h2>
            {isToday && <Badge variant="secondary" className="text-xs">Today</Badge>}
          </div>
          <Button variant="ghost" size="icon" onClick={() => handleDateChange(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DictationMic onAppend={handleDictationAppend} onUndo={handleDictationUndo} compact />
          <Button variant="outline" size="sm" className="gap-1" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" className="gap-1" onClick={() => save()} disabled={!dirty || saveStatus === "saving"}>
            <Save className="h-3.5 w-3.5" /> {saveStatus === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Save Status */}
      <div className="flex items-center justify-end">
        <SaveStatusBadge status={saveStatus} lastSavedAt={lastSavedAt} onRetry={() => save()} />
      </div>

      {/* EOD Review - Secretary Mode */}
      {secretaryMode && isToday && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <Button variant="outline" size="sm" className="gap-1 w-full" onClick={handleEodReview} disabled={eodLoading}>
              {eodLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {eodLoading ? "Generating review..." : "Run End-of-Day Review"}
            </Button>
            {eodData && (
              <Collapsible defaultOpen className="mt-3">
                <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium w-full">
                  <ChevronDown className="h-4 w-4" /> End-of-Day Review
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 space-y-2 text-sm">
                  {eodData.completed && <div><span className="font-medium text-xs text-muted-foreground">✅ Completed</span><p className="whitespace-pre-wrap">{eodData.completed}</p></div>}
                  {eodData.slipped && <div><span className="font-medium text-xs text-muted-foreground">⚠️ Slipped</span><p className="whitespace-pre-wrap">{eodData.slipped}</p></div>}
                  {eodData.tomorrow_top3 && <div><span className="font-medium text-xs text-muted-foreground">🎯 Tomorrow's Top 3</span><p className="whitespace-pre-wrap">{eodData.tomorrow_top3}</p></div>}
                  {eodData.action_items && <div><span className="font-medium text-xs text-muted-foreground">📋 Action Items</span><p className="whitespace-pre-wrap">{eodData.action_items}</p></div>}
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => {
                    navigator.clipboard.writeText(`📋 End-of-Day Review\n\n${eodData.completed ? `✅ Completed:\n${eodData.completed}\n\n` : ""}${eodData.slipped ? `⚠️ Slipped:\n${eodData.slipped}\n\n` : ""}${eodData.tomorrow_top3 ? `🎯 Tomorrow:\n${eodData.tomorrow_top3}` : ""}`);
                    toast.success("Review copied");
                  }}>
                    <Copy className="h-3 w-3" /> Copy Summary
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mode Toggle */}
      <div className="flex items-center gap-3">
        <Switch checked={structuredMode} onCheckedChange={setStructuredMode} />
        <span className="text-sm text-muted-foreground">{structuredMode ? "Structured Journal" : "Freeform Notes"}</span>
      </div>

      {isLoading ? <Skeleton className="h-48" /> : (
        <>
          {/* Structured fields */}
          {structuredMode && (
            <div className="space-y-3">
              {STRUCTURE_FIELDS.map((field) => (
                <div key={field}>
                  <label className="text-xs font-medium text-muted-foreground">{STRUCTURE_LABELS[field]}</label>
                  <Textarea
                    value={structureJson[field] ?? ""}
                    onChange={(e) => setStructureJson(prev => ({ ...prev, [field]: e.target.value }))}
                    rows={2}
                    placeholder={`Add ${field}...`}
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
          )}

          {/* Freeform content */}
          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> {structuredMode ? "Additional Notes" : "Daily Notes"}
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={structuredMode ? 4 : 12}
              placeholder="Write your notes for today… or use the mic button above to dictate."
              className="mt-1 font-mono text-sm"
            />
          </div>

          {/* Last synced timestamp */}
          {lastSavedAt && (
            <p className="text-xs text-muted-foreground text-right">Last synced: {lastSavedAt}</p>
          )}
        </>
      )}
    </div>
  );
}
