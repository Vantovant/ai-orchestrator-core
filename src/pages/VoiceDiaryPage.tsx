import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mic, MicOff, Send, Pin, PinOff, Trash2, BookOpen,
  Calendar, Clock, Star, Filter, ChevronDown
} from "lucide-react";
import { useDictation } from "@/hooks/useDictation";
import { toast } from "sonner";
import { format, isToday, isThisWeek, parseISO } from "date-fns";
import {
  getDiaryEntries,
  createDiaryEntry,
  updateDiaryEntry,
  deleteDiaryEntry,
  type VoiceDiaryEntry,
} from "@/services/voiceDiaryService";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type TimeFilter = "all" | "today" | "week" | "pinned";

export default function VoiceDiaryPage() {
  const [entries, setEntries] = useState<VoiceDiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<TimeFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleDictation = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
  }, []);

  const { state, supported, interimText, start, stop } = useDictation({
    onTranscript: handleDictation,
    continuous: true,
  });

  const isListening = state === "listening";

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();

      let data: VoiceDiaryEntry[];
      if (filter === "pinned") {
        data = await getDiaryEntries({ pinned: true, limit: 50 });
      } else if (filter === "today") {
        data = await getDiaryEntries({ from: todayStart, limit: 50 });
      } else if (filter === "week") {
        data = await getDiaryEntries({ from: weekStart, limit: 50 });
      } else {
        data = await getDiaryEntries({ limit: 100 });
      }
      setEntries(data);
    } catch {
      toast.error("Failed to load diary entries");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleSave = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    try {
      setSaving(true);
      await createDiaryEntry({
        content: text,
        source_type: isListening ? "voice" : "typed",
      });
      setInput("");
      toast.success("Diary entry saved");
      loadEntries();
    } catch {
      toast.error("Failed to save entry");
    } finally {
      setSaving(false);
    }
  }, [input, isListening, loadEntries]);

  const handleTogglePin = useCallback(async (entry: VoiceDiaryEntry) => {
    try {
      await updateDiaryEntry(entry.id, { is_pinned: !entry.is_pinned });
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, is_pinned: !e.is_pinned } : e))
      );
    } catch {
      toast.error("Failed to update entry");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteDiaryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Entry deleted");
    } catch {
      toast.error("Failed to delete entry");
    }
  }, []);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Voice Diary
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Speak your thoughts. Your AI Partner remembers.
          </p>
        </div>
      </div>

      {/* Input area */}
      <Card className="border-primary/20">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isListening ? "Listening… speak your thoughts" : "Tap the mic or type your thoughts…"}
              className="min-h-[100px] pr-12 resize-none text-base"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
              }}
            />
          </div>

          {/* Interim text */}
          {isListening && interimText && (
            <p className="text-sm text-muted-foreground italic animate-pulse px-1">
              {interimText}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {supported && (
                <Button
                  variant={isListening ? "destructive" : "outline"}
                  size="default"
                  onClick={isListening ? stop : start}
                  className={`gap-2 ${isListening ? "animate-pulse" : ""}`}
                >
                  {isListening ? (
                    <><MicOff className="h-4 w-4" /> Stop</>
                  ) : (
                    <><Mic className="h-4 w-4" /> Dictate</>
                  )}
                </Button>
              )}
              {isListening && (
                <span className="text-xs text-destructive font-medium">● Recording</span>
              )}
            </div>

            <Button
              onClick={handleSave}
              disabled={!input.trim() || saving}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              Save Entry
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as TimeFilter)}>
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="all" className="gap-1 text-xs">
            <Clock className="h-3 w-3" /> All
          </TabsTrigger>
          <TabsTrigger value="today" className="gap-1 text-xs">
            <Calendar className="h-3 w-3" /> Today
          </TabsTrigger>
          <TabsTrigger value="week" className="gap-1 text-xs">
            <Filter className="h-3 w-3" /> This Week
          </TabsTrigger>
          <TabsTrigger value="pinned" className="gap-1 text-xs">
            <Star className="h-3 w-3" /> Pinned
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Entries */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-muted-foreground text-sm">
              {filter === "today"
                ? "No diary entries today. Tap the mic and speak your thoughts."
                : filter === "pinned"
                ? "No pinned entries yet."
                : "Your voice diary is empty. Start by speaking or typing."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isExpanded = expandedId === entry.id;
            const isLong = entry.content.length > 200;
            return (
              <Card key={entry.id} className="group hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{format(parseISO(entry.created_at), "MMM d, yyyy · HH:mm")}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {entry.source_type === "voice" ? "🎙 Voice" : "⌨ Typed"}
                      </Badge>
                      {entry.is_pinned && (
                        <Pin className="h-3 w-3 text-primary fill-primary" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleTogglePin(entry)}
                        title={entry.is_pinned ? "Unpin" : "Pin"}
                      >
                        {entry.is_pinned ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete diary entry?</AlertDialogTitle>
                            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(entry.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {entry.title && (
                    <p className="font-medium text-sm mb-1">{entry.title}</p>
                  )}

                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {isLong && !isExpanded
                      ? entry.content.slice(0, 200) + "…"
                      : entry.content}
                  </p>

                  {isLong && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-6 text-xs text-muted-foreground px-1"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      <ChevronDown className={`h-3 w-3 mr-1 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      {isExpanded ? "Show less" : "Show more"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
