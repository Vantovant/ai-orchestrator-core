import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, Trash2, Save, X, Bell, Calendar, ArrowRight, Sparkles, FolderKanban } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { Task } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { projectService } from "@/services/projectService";

interface Props {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (id: string, updates: any) => void;
  onDelete: (id: string) => void;
}

const priorityColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-primary text-primary-foreground",
  low: "bg-muted text-muted-foreground",
};

export default function TaskDetailDrawer({ task, open, onClose, onUpdate, onDelete }: Props) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");

  const startEdit = () => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setPriority(task.priority);
    setDueDate(task.due_date ? task.due_date.slice(0, 16) : "");
    setEditing(true);
  };

  const saveEdit = () => {
    if (!task) return;
    onUpdate(task.id, {
      title,
      description: description || undefined,
      priority,
      due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
    });
    setEditing(false);
  };

  const convertToReminder = async () => {
    if (!task) return;
    try {
      await reminderService.create({
        title: task.title,
        reminder_time: task.due_date || new Date().toISOString(),
        description: task.description || undefined,
      });
      toast.success("Reminder created from task");
    } catch {
      toast.error("Failed to create reminder");
    }
  };

  const snoozeTask = (hours: number) => {
    if (!task) return;
    const newDate = new Date();
    newDate.setHours(newDate.getHours() + hours);
    onUpdate(task.id, { due_date: newDate.toISOString() });
    toast.success(`Snoozed ${hours}h`);
  };

  const projectQuery = useQuery({
    queryKey: ["project", task?.project_id],
    queryFn: () => projectService.get(task!.project_id!),
    enabled: !!task?.project_id,
  });

  if (!task) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setEditing(false); onClose(); } }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Task Details
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
            <div>
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Due Date</label>
              <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={saveEdit} className="flex-1 gap-1"><Save className="h-4 w-4" /> Save</Button>
              <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className={`text-lg font-semibold ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                {task.title}
              </h3>
              {task.description && <p className="text-sm text-muted-foreground mt-1">{task.description}</p>}
              {projectQuery.data && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <button
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                    onClick={() => { onClose(); navigate(`/projects?open=${task.project_id}`); }}
                  >
                    <FolderKanban className="h-3 w-3" />
                    Project: {projectQuery.data.name}
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2 gap-1"
                    onClick={() => {
                      onUpdate(task.id, { project_id: null });
                      toast.success("Moved to main plan");
                    }}
                  >
                    <ArrowRight className="h-3 w-3" /> Move to main plan
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Priority</span>
                <div className="mt-1"><Badge className={priorityColors[task.priority] ?? ""}>{task.priority}</Badge></div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <div className="mt-1"><Badge variant="outline" className="capitalize">{task.status}</Badge></div>
              </div>
              {task.due_date && (
                <div>
                  <span className="text-xs text-muted-foreground">Due</span>
                  <p className="text-sm mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> {format(new Date(task.due_date), "MMM d, h:mm a")}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground">Created</span>
                <p className="text-sm mt-1">{format(new Date(task.created_at), "MMM d, yyyy")}</p>
              </div>
              {task.source && task.source !== "manual" && (
                <div>
                  <span className="text-xs text-muted-foreground">Source</span>
                  <p className="text-sm mt-1 capitalize">{task.source}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => onUpdate(task.id, { status: task.status === "done" ? "pending" : "done" })}>
                  {task.status === "done" ? "Mark Pending" : "✓ Mark Done"}
                </Button>
                <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
              </div>

              {/* Snooze options */}
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={() => snoozeTask(3)}>
                  <Clock className="h-3 w-3" /> +3h
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={() => snoozeTask(24)}>
                  <Clock className="h-3 w-3" /> Tomorrow
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 text-xs gap-1" onClick={() => snoozeTask(168)}>
                  <Clock className="h-3 w-3" /> Next week
                </Button>
              </div>

              {/* Convert to reminder */}
              <Button variant="outline" size="sm" className="gap-1" onClick={convertToReminder}>
                <Bell className="h-3.5 w-3.5" /> Convert to Reminder
              </Button>

              <Button variant="destructive" size="sm" className="gap-1" onClick={() => { onDelete(task.id); onClose(); }}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
