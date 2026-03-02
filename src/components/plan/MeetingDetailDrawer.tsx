import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Trash2, Save, X, Sparkles, Loader2, FolderKanban } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Meeting } from "@/services/meetingService";
import { secretaryService } from "@/services/secretaryService";
import { projectService } from "@/services/projectService";

interface Props {
  meeting: Meeting | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: any) => void;
  onDelete: (id: string) => void;
}

export default function MeetingDetailDrawer({ meeting, open, onClose, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepData, setPrepData] = useState<any>(null);

  const startEdit = () => {
    if (!meeting) return;
    setTitle(meeting.title);
    setDescription(meeting.description ?? "");
    setLocation(meeting.location ?? "");
    setStartTime(meeting.start_time.slice(0, 16));
    setEndTime(meeting.end_time.slice(0, 16));
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
    });
    setEditing(false);
  };

  const handlePrep = async () => {
    if (!meeting) return;
    setPrepLoading(true);
    try {
      const result = await secretaryService.runPreMeetingPrep(meeting.id);
      setPrepData(result);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate prep");
    } finally {
      setPrepLoading(false);
    }
  };

  const projectQuery = useQuery({
    queryKey: ["project", meeting?.project_id],
    queryFn: () => projectService.get(meeting!.project_id!),
    enabled: !!meeting?.project_id,
  });

  if (!meeting) return null;

  const isPast = new Date(meeting.end_time) < new Date();
  const isNow = new Date(meeting.start_time) <= new Date() && new Date(meeting.end_time) >= new Date();

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setEditing(false); setPrepData(null); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
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
            <div className="flex gap-2">
              <Button onClick={saveEdit} className="flex-1 gap-1"><Save className="h-4 w-4" /> Save</Button>
              <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">{meeting.title}</h3>
                {isNow && <Badge className="bg-success text-success-foreground animate-pulse">Live</Badge>}
                {isPast && <Badge variant="secondary">Past</Badge>}
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

            {/* AI Prep */}
            {!isPast && (
              <div className="border border-border rounded-lg p-3">
                <Button variant="outline" size="sm" className="gap-1 w-full" onClick={handlePrep} disabled={prepLoading}>
                  {prepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {prepLoading ? "Generating prep..." : "AI Meeting Prep"}
                </Button>
                {prepData && (
                  <div className="mt-3 space-y-2 text-sm">
                    {prepData.agenda && (
                      <div><span className="font-medium text-xs text-muted-foreground">Suggested Agenda</span><p className="whitespace-pre-wrap">{prepData.agenda}</p></div>
                    )}
                    {prepData.questions && (
                      <div><span className="font-medium text-xs text-muted-foreground">Key Questions</span><p className="whitespace-pre-wrap">{prepData.questions}</p></div>
                    )}
                    {prepData.risks && (
                      <div><span className="font-medium text-xs text-muted-foreground">Risks</span><p className="whitespace-pre-wrap">{prepData.risks}</p></div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={startEdit}>Edit Meeting</Button>
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
