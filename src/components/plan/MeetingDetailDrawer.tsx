import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, Clock, MapPin, Trash2, Save, X, Sparkles, Loader2, FolderKanban, Pencil, BrainCircuit, Lightbulb, ChevronDown, Copy } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Meeting } from "@/services/meetingService";
import { secretaryService } from "@/services/secretaryService";
import { projectService } from "@/services/projectService";
import { supabase } from "@/integrations/supabase/client";
import ActionExtractor from "@/components/plan/ActionExtractor";

interface Props {
  meeting: Meeting | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: any) => void;
  onDelete: (id: string) => void;
}

// Hook: debounced background AI advisor
function useMeetingAdvisor(notes: string, meetingId: string | undefined, enabled: boolean) {
  const [advice, setAdvice] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastHashRef = useRef("");

  const fetchAdvice = useCallback(async (text: string, mId: string) => {
    // Simple hash to avoid re-fetching same content
    const hash = `${text.length}-${text.slice(0, 50)}-${text.slice(-50)}`;
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("plan-ai-secretary", {
        body: { action: "meeting_advisor", meetingId: mId, notes_text: text },
      });
      if (error) throw error;
      const items = data?.suggestions || data?.advice || [];
      if (Array.isArray(items)) {
        setAdvice(items.map((i: any) => typeof i === "string" ? i : i.text || i.suggestion || JSON.stringify(i)));
      } else if (typeof data?.content === "string") {
        setAdvice(data.content.split("\n").filter((l: string) => l.trim()));
      }
    } catch {
      // Silent fail - advisor is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !meetingId || notes.trim().length < 30) {
      setAdvice([]);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchAdvice(notes, meetingId), 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [notes, meetingId, enabled, fetchAdvice]);

  return { advice, loading };
}

export default function MeetingDetailDrawer({ meeting, open, onClose, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [prepLoading, setPrepLoading] = useState(false);
  const [advisorEnabled, setAdvisorEnabled] = useState(true);

  const { advice, loading: advisorLoading } = useMeetingAdvisor(notes, meeting?.id, advisorEnabled && open);

  // Sync notes field when meeting changes
  useEffect(() => {
    if (meeting) {
      setNotes(meeting.notes ?? "");
    }
  }, [meeting?.id, meeting?.notes]);

  const startEdit = () => {
    if (!meeting) return;
    setTitle(meeting.title);
    setDescription(meeting.description ?? "");
    setLocation(meeting.location ?? "");
    setStartTime(meeting.start_time.slice(0, 16));
    setEndTime(meeting.end_time.slice(0, 16));
    setNotes(meeting.notes ?? "");
    setEditing(true);
  };

  const saveEdit = () => {
    if (!meeting) return;
    onUpdate(meeting.id, {
      title,
      description: description || undefined,
      location: location || undefined,
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      notes: notes || undefined,
    });
    setEditing(false);
  };

  const saveNotes = () => {
    if (!meeting) return;
    onUpdate(meeting.id, { notes: notes || undefined });
    toast.success("Notes saved");
  };

  const handlePrep = async () => {
    if (!meeting) return;
    setPrepLoading(true);
    try {
      const result = await secretaryService.runPreMeetingPrep(meeting.id);
      const parts: string[] = [];
      if (result.agenda) parts.push(`📋 AGENDA\n${result.agenda}`);
      if (result.questions) parts.push(`❓ KEY QUESTIONS\n${result.questions}`);
      if (result.risks) parts.push(`⚠️ RISKS & CONSIDERATIONS\n${result.risks}`);
      if (result.preparation) parts.push(`📝 PREPARATION GUIDE\n${result.preparation}`);
      if (result.talking_points) parts.push(`💬 TALKING POINTS\n${result.talking_points}`);

      const prepText = parts.length > 0
        ? parts.join("\n\n---\n\n")
        : (result.text || result.summary || JSON.stringify(result, null, 2));

      const existingNotes = notes.trim();
      const newNotes = existingNotes
        ? `${existingNotes}\n\n──── AI Meeting Prep ────\n\n${prepText}`
        : `──── AI Meeting Prep ────\n\n${prepText}`;

      setNotes(newNotes);
      onUpdate(meeting.id, { notes: newNotes });
      toast.success("AI prep injected into notes – review and edit as needed");
    } catch (e: any) {
      toast.error(e.message || "Failed to generate prep");
    } finally {
      setPrepLoading(false);
    }
  };

  const handleToggleDone = () => {
    if (!meeting) return;
    onUpdate(meeting.id, { is_done: !meeting.is_done });
  };

  const projectQuery = useQuery({
    queryKey: ["project", meeting?.project_id],
    queryFn: () => projectService.get(meeting!.project_id!),
    enabled: !!meeting?.project_id,
  });

  if (!meeting) return null;

  const isPast = new Date(meeting.end_time) < new Date();
  const isNow = new Date(meeting.start_time) <= new Date() && new Date(meeting.end_time) >= new Date();
  const today = new Date().toISOString().split("T")[0];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Meeting Details
          </SheetTitle>
        </SheetHeader>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start</label>
                <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">End</label>
                <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Location</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Agenda / Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={6} placeholder="Meeting agenda, talking points, notes..." />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveEdit} className="flex-1 gap-1"><Save className="h-4 w-4" /> Save</Button>
              <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header with done checkbox */}
            <div>
              <div className="flex items-start gap-3 mb-1">
                <Checkbox
                  checked={meeting.is_done}
                  onCheckedChange={handleToggleDone}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={`text-lg font-semibold ${meeting.is_done ? "line-through text-muted-foreground" : ""}`}>{meeting.title}</h3>
                    {isNow && <Badge className="bg-success text-success-foreground animate-pulse">Live</Badge>}
                    {isPast && !meeting.is_done && <Badge variant="secondary">Past</Badge>}
                    {meeting.is_done && <Badge className="bg-success/20 text-success-foreground">Done</Badge>}
                  </div>
                  {meeting.description && <p className="text-sm text-muted-foreground">{meeting.description}</p>}
                  {projectQuery.data && (
                    <button
                      className="flex items-center gap-1.5 mt-2 text-xs text-primary hover:underline"
                      onClick={() => { onClose(); navigate(`/projects?open=${meeting.project_id}`); }}
                    >
                      <FolderKanban className="h-3 w-3" />
                      Project: {projectQuery.data.name}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Start</span>
                <p className="text-sm mt-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(meeting.start_time), "MMM d, h:mm a")}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">End</span>
                <p className="text-sm mt-1">{format(new Date(meeting.end_time), "h:mm a")}</p>
              </div>
              {meeting.location && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">Location</span>
                  <p className="text-sm mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {meeting.location}</p>
                </div>
              )}
            </div>

            {/* Editable Agenda/Notes */}
            <div className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Agenda / Notes</span>
                {notes !== (meeting.notes ?? "") && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={saveNotes}>
                    <Save className="h-3 w-3" /> Save
                  </Button>
                )}
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                placeholder="Add meeting agenda, talking points, notes..."
                className="text-sm"
              />
            </div>

            {/* AI Background Advisor */}
            {(advice.length > 0 || advisorLoading) && (
              <div className="border border-accent/30 bg-accent/5 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-accent-foreground flex items-center gap-1.5">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                    AI Advisor
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px] px-1.5"
                    onClick={() => setAdvisorEnabled(false)}
                  >
                    Dismiss
                  </Button>
                </div>
                {advisorLoading && advice.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Analyzing notes...
                  </div>
                )}
                {advice.length > 0 && (
                  <ul className="space-y-1.5">
                    {advice.slice(0, 5).map((tip, i) => (
                      <li key={i} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                        <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Action Extractor — extract tasks from meeting notes */}
            <div className="border border-border rounded-lg p-3 space-y-2">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <BrainCircuit className="h-3.5 w-3.5" />
                Extract Action Items
              </span>
              <ActionExtractor
                noteContent={notes}
                structureJson={{}}
                structuredMode={false}
                noteDate={today}
                projectId={meeting.project_id}
                noteId={meeting.id}
              />
            </div>

            {/* AI Prep */}
            {!isPast && (
              <div className="border border-border rounded-lg p-3">
                <Button variant="outline" size="sm" className="gap-1 w-full" onClick={handlePrep} disabled={prepLoading}>
                  {prepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {prepLoading ? "Generating prep..." : "AI Meeting Prep → Insert into Notes"}
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                  Generates agenda, questions & risks directly into notes above
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              <Button variant="outline" size="sm" className="gap-1" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit All Fields
              </Button>
              <Button variant="destructive" size="sm" className="gap-1" onClick={() => { onDelete(meeting.id); onClose(); }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}