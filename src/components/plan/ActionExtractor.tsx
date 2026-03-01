import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Check, ListTodo, Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { taskService } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";

export interface ActionSuggestion {
  type: "task" | "reminder";
  title: string;
  due_at?: string;
  remind_at?: string;
  priority?: string;
  source: string;
  selected?: boolean;
  created?: boolean;
}

interface Props {
  noteContent: string;
  structureJson: Record<string, string>;
  structuredMode: boolean;
  noteDate: string;
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

export default function ActionExtractor({ noteContent, structureJson, structuredMode, noteDate }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
  const [applying, setApplying] = useState(false);

  const handleExtract = async () => {
    const text = buildNoteText(noteContent, structureJson, structuredMode);
    if (!text.trim()) {
      toast.info("Write some notes first before extracting actions.");
      return;
    }
    setLoading(true);
    setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke("plan-ai-extract-actions", {
        body: { content: text, note_date: noteDate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const items = (data?.suggestions || []).map((s: ActionSuggestion) => ({ ...s, selected: true, created: false }));
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
    const toCreate = suggestions.filter(s => s.selected && !s.created);
    if (toCreate.length === 0) {
      toast.info("No items selected.");
      return;
    }
    setApplying(true);
    let created = 0;
    const updatedSuggestions = [...suggestions];

    for (let i = 0; i < updatedSuggestions.length; i++) {
      const s = updatedSuggestions[i];
      if (!s.selected || s.created) continue;
      try {
        if (s.type === "task") {
          await taskService.create({
            title: s.title,
            priority: priorityMap[s.priority || "P2"] || "medium",
            due_date: s.due_at || null,
            source: "notes",
          });
        } else if (s.type === "reminder") {
          await reminderService.create({
            title: s.title,
            reminder_time: s.remind_at || new Date().toISOString(),
          });
        }
        updatedSuggestions[i] = { ...s, created: true };
        created++;
      } catch (e: any) {
        console.error(`Failed to create ${s.type}: ${s.title}`, e);
      }
    }

    setSuggestions(updatedSuggestions);
    setApplying(false);
    toast.success(`Created ${created} item${created !== 1 ? "s" : ""}`);
  };

  const selectedCount = suggestions.filter(s => s.selected && !s.created).length;
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
                <label
                  key={idx}
                  className={`flex items-start gap-2 p-2 rounded-md border text-sm cursor-pointer transition-colors ${
                    s.created
                      ? "bg-primary/5 border-primary/30"
                      : s.selected
                      ? "bg-accent/50 border-accent"
                      : "bg-background border-border"
                  }`}
                >
                  {s.created ? (
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  ) : (
                    <Checkbox
                      checked={s.selected}
                      onCheckedChange={() => toggleSelection(idx)}
                      className="mt-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {s.type === "task" ? (
                        <ListTodo className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <Bell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className={s.created ? "line-through text-muted-foreground" : ""}>
                        {s.title}
                      </span>
                    </div>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {s.type}
                      </Badge>
                      {s.priority && (
                        <Badge
                          variant={s.priority === "P1" ? "destructive" : "secondary"}
                          className="text-[10px] px-1 py-0"
                        >
                          {s.priority}
                        </Badge>
                      )}
                      {(s.due_at || s.remind_at) && (
                        <span className="text-[10px] text-muted-foreground">
                          {s.due_at || s.remind_at}
                        </span>
                      )}
                      {s.created && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 gap-0.5">
                          <Check className="h-2.5 w-2.5" /> Created
                        </Badge>
                      )}
                    </div>
                  </div>
                </label>
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
                {applying ? "Creating…" : `Apply ${selectedCount} Selected`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
