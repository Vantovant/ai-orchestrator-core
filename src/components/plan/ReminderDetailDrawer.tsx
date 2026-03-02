import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Clock, Trash2, Save, X, CheckSquare, Calendar as CalendarIcon, MapPin, Video } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Reminder } from "@/services/reminderService";
import { taskService } from "@/services/taskService";
import { meetingService } from "@/services/meetingService";
import { reminderService } from "@/services/reminderService";

const MEETING_KEYWORDS = /\b(meeting|zoom|teams|google\s*meet|call|sync|session|standup|huddle|catch-?up)\b/i;
const MEETING_LINK_PATTERN = /https?:\/\/[^\s]*(zoom\.us|teams\.microsoft\.com|meet\.google\.com)[^\s]*/i;

function detectMeetingHint(reminder: Reminder): { isMeeting: boolean; link?: string } {
  const text = `${reminder.title} ${reminder.description ?? ""}`;
  const linkMatch = text.match(MEETING_LINK_PATTERN);
  const hasKeywords = MEETING_KEYWORDS.test(text);
  return { isMeeting: hasKeywords || !!linkMatch, link: linkMatch?.[0] };
}

interface Props {
  reminder: Reminder | null;
  open: boolean;
  onClose: () => void;
  onToggle: (id: string, isDone: boolean) => void;
  onDelete: (id: string) => void;
  onMeetingCreated?: () => void;
}

export default function ReminderDetailDrawer({ reminder, open, onClose, onToggle, onDelete, onMeetingCreated }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [reminderTime, setReminderTime] = useState("");

  // Convert to meeting state
  const [convertOpen, setConvertOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingEnd, setMeetingEnd] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [converting, setConverting] = useState(false);

  const startEdit = () => {
    if (!reminder) return;
    setTitle(reminder.title);
    setReminderTime(reminder.reminder_time.slice(0, 16));
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!reminder) return;
    try {
      await reminderService.update(reminder.id, {
        title,
        reminder_time: new Date(reminderTime).toISOString(),
      });
      toast.success("Updated");
      setEditing(false);
      onClose();
    } catch {
      toast.error("Failed to update");
    }
  };

  const snoozeReminder = async (hours: number) => {
    if (!reminder) return;
    const newTime = new Date();
    newTime.setHours(newTime.getHours() + hours);
    try {
      await reminderService.update(reminder.id, { reminder_time: newTime.toISOString() });
      toast.success(`Snoozed ${hours}h`);
      onClose();
    } catch {
      toast.error("Failed to snooze");
    }
  };

  const convertToTask = async () => {
    if (!reminder) return;
    try {
      await taskService.create({
        title: reminder.title,
        priority: "medium",
        due_date: reminder.reminder_time,
        description: reminder.description || undefined,
      });
      toast.success("Task created from reminder");
    } catch {
      toast.error("Failed to create task");
    }
  };

  const openConvertToMeeting = () => {
    if (!reminder) return;
    const hint = detectMeetingHint(reminder);
    const startDate = new Date(reminder.reminder_time);
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
    setMeetingTitle(reminder.title);
    setMeetingStart(format(startDate, "yyyy-MM-dd'T'HH:mm"));
    setMeetingEnd(format(endDate, "yyyy-MM-dd'T'HH:mm"));
    setMeetingLocation(hint.link ?? "");
    setConvertOpen(true);
  };

  const handleConvertToMeeting = async () => {
    if (!reminder) return;
    setConverting(true);
    try {
      await meetingService.create({
        title: meetingTitle,
        start_time: new Date(meetingStart).toISOString(),
        end_time: new Date(meetingEnd).toISOString(),
        location: meetingLocation || undefined,
        notes: reminder.description || undefined,
      });
      // Mark reminder as done (converted)
      await reminderService.toggleDone(reminder.id, true);
      toast.success("Converted to Meeting ✓");
      setConvertOpen(false);
      onClose();
      onMeetingCreated?.();
    } catch {
      toast.error("Failed to convert");
    } finally {
      setConverting(false);
    }
  };

  if (!reminder) return null;

  const isPast = new Date(reminder.reminder_time) < new Date();
  const meetingHint = detectMeetingHint(reminder);

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-warning" />
              Reminder Details
            </SheetTitle>
          </SheetHeader>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">When</label>
                <Input type="datetime-local" value={reminderTime} onChange={(e) => setReminderTime(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={saveEdit} className="flex-1 gap-1"><Save className="h-4 w-4" /> Save</Button>
                <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Smart meeting suggestion banner */}
              {meetingHint.isMeeting && !reminder.is_done && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Video className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium">This looks like a meeting</span>
                  </div>
                  <Button size="sm" variant="default" className="gap-1 shrink-0" onClick={openConvertToMeeting}>
                    Convert
                  </Button>
                </div>
              )}

              <div>
                <h3 className={`text-lg font-semibold ${reminder.is_done ? "line-through text-muted-foreground" : ""}`}>
                  {reminder.title}
                </h3>
                {reminder.description && <p className="text-sm text-muted-foreground mt-1">{reminder.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground">When</span>
                  <p className="text-sm mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(reminder.reminder_time), "MMM d, h:mm a")}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Status</span>
                  <div className="mt-1">
                    <Badge variant={reminder.is_done ? "secondary" : isPast ? "destructive" : "outline"}>
                      {reminder.is_done ? "Done" : isPast ? "Overdue" : "Upcoming"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Created</span>
                  <p className="text-sm mt-1">{format(new Date(reminder.created_at), "MMM d, yyyy")}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-4 border-t border-border">
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => onToggle(reminder.id, !reminder.is_done)}>
                    {reminder.is_done ? "Mark Not Done" : "✓ Mark Done"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
                </div>

                {/* Snooze options */}
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={() => snoozeReminder(1)}>
                    <Clock className="h-3 w-3" /> +1h
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={() => snoozeReminder(3)}>
                    <Clock className="h-3 w-3" /> +3h
                  </Button>
                  <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={() => snoozeReminder(24)}>
                    <Clock className="h-3 w-3" /> Tomorrow
                  </Button>
                </div>

                {/* Convert actions */}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={convertToTask}>
                    <CheckSquare className="h-3.5 w-3.5" /> Convert to Task
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={openConvertToMeeting}>
                    <CalendarIcon className="h-3.5 w-3.5" /> Convert to Meeting
                  </Button>
                </div>

                <Button variant="destructive" size="sm" className="gap-1" onClick={() => { onDelete(reminder.id); onClose(); }}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Convert to Meeting Dialog */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" /> Convert to Meeting
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); handleConvertToMeeting(); }}>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start</label>
                <Input type="datetime-local" value={meetingStart} onChange={(e) => setMeetingStart(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">End</label>
                <Input type="datetime-local" value={meetingEnd} onChange={(e) => setMeetingEnd(e.target.value)} required />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Location / Link
              </label>
              <Input value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} placeholder="Zoom link, office, etc." />
            </div>
            <Button type="submit" className="w-full" disabled={converting}>
              {converting ? "Converting..." : "Create Meeting"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
