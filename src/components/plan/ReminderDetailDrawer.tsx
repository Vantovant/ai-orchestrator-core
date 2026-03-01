import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bell, Clock, Trash2, Save, X, CheckSquare } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Reminder } from "@/services/reminderService";
import { taskService } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";

interface Props {
  reminder: Reminder | null;
  open: boolean;
  onClose: () => void;
  onToggle: (id: string, isDone: boolean) => void;
  onDelete: (id: string) => void;
}

export default function ReminderDetailDrawer({ reminder, open, onClose, onToggle, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [reminderTime, setReminderTime] = useState("");

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

  if (!reminder) return null;

  const isPast = new Date(reminder.reminder_time) < new Date();

  return (
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

              {/* Convert to task */}
              <Button variant="outline" size="sm" className="gap-1" onClick={convertToTask}>
                <CheckSquare className="h-3.5 w-3.5" /> Convert to Task
              </Button>

              <Button variant="destructive" size="sm" className="gap-1" onClick={() => { onDelete(reminder.id); onClose(); }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
