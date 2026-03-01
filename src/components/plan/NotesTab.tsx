import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BookOpen, Save, ChevronLeft, ChevronRight, Copy, Sparkles, Loader2, ChevronDown, Mic } from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { toast } from "sonner";
import { notesService, STRUCTURE_FIELDS, STRUCTURE_LABELS, type StructureField } from "@/services/notesService";
import { secretaryService } from "@/services/secretaryService";
import VoiceInput from "@/components/voice/VoiceInput";

interface Props {
  secretaryMode: boolean;
}

export default function NotesTab({ secretaryMode }: Props) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [content, setContent] = useState("");
  const [structuredMode, setStructuredMode] = useState(false);
  const [structureJson, setStructureJson] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [eodLoading, setEodLoading] = useState(false);
  const [eodData, setEodData] = useState<any>(null);
  const qc = useQueryClient();

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  const noteQuery = useQuery({
    queryKey: ["daily-note", selectedDate],
    queryFn: () => notesService.getByDate(selectedDate),
  });

  useEffect(() => {
    if (noteQuery.data) {
      setContent(noteQuery.data.content);
      setStructuredMode(noteQuery.data.structured_mode);
      setStructureJson(noteQuery.data.structure_json ?? {});
    } else if (!noteQuery.isLoading) {
      setContent("");
      setStructuredMode(false);
      setStructureJson({});
    }
    setDirty(false);
    setEodData(null);
  }, [noteQuery.data, noteQuery.isLoading]);

  const saveMutation = useMutation({
    mutationFn: () => notesService.upsert(selectedDate, content, structuredMode, structureJson),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-note", selectedDate] });
      setDirty(false);
      toast.success("Note saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleContentChange = (val: string) => { setContent(val); setDirty(true); };
  const handleStructureChange = (field: StructureField, val: string) => {
    setStructureJson((prev) => ({ ...prev, [field]: val }));
    setDirty(true);
  };

  const handleVoiceDictation = useCallback((text: string) => {
    setContent(prev => prev ? `${prev}\n${text}` : text);
    setDirty(true);
    toast.success("Voice note added");
  }, []);

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

  return (
    <div className="space-y-4">
      {/* Date Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <h2 className="text-lg font-semibold">{format(new Date(selectedDate), "EEEE, MMM d")}</h2>
            {isToday && <Badge variant="secondary" className="text-xs">Today</Badge>}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <VoiceInput onTranscript={handleVoiceDictation} compact />
          <Button variant="outline" size="sm" className="gap-1" onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" className="gap-1" onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
            <Save className="h-3.5 w-3.5" /> {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
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
        <Switch checked={structuredMode} onCheckedChange={(v) => { setStructuredMode(v); setDirty(true); }} />
        <span className="text-sm text-muted-foreground">{structuredMode ? "Structured Journal" : "Freeform Notes"}</span>
      </div>

      {noteQuery.isLoading ? <Skeleton className="h-48" /> : (
        <>
          {/* Structured fields */}
          {structuredMode && (
            <div className="space-y-3">
              {STRUCTURE_FIELDS.map((field) => (
                <div key={field}>
                  <label className="text-xs font-medium text-muted-foreground">{STRUCTURE_LABELS[field]}</label>
                  <Textarea
                    value={structureJson[field] ?? ""}
                    onChange={(e) => handleStructureChange(field, e.target.value)}
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
              onChange={(e) => handleContentChange(e.target.value)}
              rows={structuredMode ? 4 : 12}
              placeholder="Write your notes for today... or use the mic button above to dictate."
              className="mt-1 font-mono text-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}
