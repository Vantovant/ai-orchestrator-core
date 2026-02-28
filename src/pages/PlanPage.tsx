import { useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { taskService, type TaskInsert } from "@/services/taskService";
import { reminderService, type ReminderInsert } from "@/services/reminderService";
import { meetingService, type MeetingInsert } from "@/services/meetingService";
import { financeEntryService } from "@/services/financeService";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CheckSquare, Bell, Calendar as CalendarIcon, Clock, MapPin,
  Plus, Trash2, Pencil, Target, ChevronLeft, ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import ComplianceWidget from "@/components/compliance/ComplianceWidget";
import ClientTagPicker from "@/components/clients/ClientTagPicker";
import VoiceInput from "@/components/voice/VoiceInput";
import VoiceConfirmation from "@/components/voice/VoiceConfirmation";
import { parseVoiceCommand, type ParsedVoiceCommand } from "@/lib/voiceCommandParser";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, isSameDay, isSameMonth, isToday } from "date-fns";

const priorityColor: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-primary text-primary-foreground",
  low: "bg-muted text-muted-foreground",
};

// ── Quick Add FAB (mobile) ──
function QuickAddFab({ onAdd }: { onAdd: (type: "task" | "reminder" | "meeting") => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-20 right-4 z-40 md:hidden">
      {open && (
        <div className="mb-2 flex flex-col gap-2 animate-in slide-in-from-bottom-2">
          <Button size="sm" className="gap-1 shadow-lg" onClick={() => { onAdd("task"); setOpen(false); }}>
            <CheckSquare className="h-4 w-4" /> Task
          </Button>
          <Button size="sm" className="gap-1 shadow-lg" onClick={() => { onAdd("reminder"); setOpen(false); }}>
            <Bell className="h-4 w-4" /> Reminder
          </Button>
          <Button size="sm" className="gap-1 shadow-lg" onClick={() => { onAdd("meeting"); setOpen(false); }}>
            <CalendarIcon className="h-4 w-4" /> Meeting
          </Button>
        </div>
      )}
      <Button size="icon" className="h-14 w-14 rounded-full shadow-xl" onClick={() => setOpen(!open)}>
        <Plus className={`h-6 w-6 transition-transform ${open ? "rotate-45" : ""}`} />
      </Button>
    </div>
  );
}

// ── Today Tab ──
function TodayTab({ tasks, reminders, meetings, isLoading, onAdd }: any) {
  const now = new Date();
  const todayMeetings = (meetings ?? []).filter((m: any) => isSameDay(new Date(m.start_time), now));
  const urgentReminders = (reminders ?? []).filter((r: any) => !r.is_done && new Date(r.reminder_time).getTime() - now.getTime() < 48 * 60 * 60 * 1000);
  const priorityOrder = ["critical", "high", "medium", "low"];
  const topTasks = (tasks ?? [])
    .filter((t: any) => t.status !== "done")
    .sort((a: any, b: any) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{todayMeetings.length}</p>
          <p className="text-xs text-muted-foreground">Meetings</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{urgentReminders.length}</p>
          <p className="text-xs text-muted-foreground">Urgent</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold">{topTasks.length}</p>
          <p className="text-xs text-muted-foreground">Priorities</p>
        </CardContent></Card>
      </div>

      {/* Quick add row — desktop */}
      <div className="hidden md:flex gap-2 items-center">
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onAdd("task")}><Plus className="h-3 w-3" /> Task</Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onAdd("reminder")}><Plus className="h-3 w-3" /> Reminder</Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onAdd("meeting")}><Plus className="h-3 w-3" /> Meeting</Button>
      </div>

      {/* Top Priorities */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Top Priorities</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-20" /> : topTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet</p>
          ) : (
            <div className="space-y-2">
              {topTasks.map((t: any, i: number) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                    <span className="text-sm font-medium truncate">{t.title}</span>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 ${priorityColor[t.priority] ?? ""}`}>{t.priority}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Meetings */}
      {todayMeetings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Today's Meetings</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {todayMeetings.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{m.title}</span>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(m.start_time), "h:mm a")}
                    {m.location ? ` · ${m.location}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Urgent Reminders */}
      {urgentReminders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-warning" /> Urgent Reminders</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {urgentReminders.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{r.title}</span>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.reminder_time), "MMM d, h:mm a")}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Compliance Widget */}
      <ComplianceWidget compact />
    </div>
  );
}

// ── Calendar Tab ──
type CalView = "day" | "week" | "month";
function CalendarTab({ tasks, reminders, meetings, onAdd }: any) {
  const [view, setView] = useState<CalView>("month");
  const [current, setCurrent] = useState(new Date());

  const navigate = (dir: 1 | -1) => {
    if (view === "month") setCurrent(dir === 1 ? addMonths(current, 1) : subMonths(current, 1));
    else if (view === "week") setCurrent(dir === 1 ? addWeeks(current, 1) : subWeeks(current, 1));
    else setCurrent(dir === 1 ? addDays(current, 1) : subDays(current, 1));
  };

  const days = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(current), { weekStartsOn: 1 });
      const end = endOfWeek(endOfMonth(current), { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    } else if (view === "week") {
      const start = startOfWeek(current, { weekStartsOn: 1 });
      const end = endOfWeek(current, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
    return [current];
  }, [view, current]);

  const getEventsForDay = (day: Date) => {
    const items: { type: string; title: string; time?: string; color: string }[] = [];
    (meetings ?? []).forEach((m: any) => {
      if (isSameDay(new Date(m.start_time), day)) items.push({ type: "meeting", title: m.title, time: format(new Date(m.start_time), "h:mm a"), color: "bg-primary" });
    });
    (reminders ?? []).filter((r: any) => !r.is_done).forEach((r: any) => {
      if (isSameDay(new Date(r.reminder_time), day)) items.push({ type: "reminder", title: r.title, time: format(new Date(r.reminder_time), "h:mm a"), color: "bg-warning" });
    });
    (tasks ?? []).filter((t: any) => t.due_date && t.status !== "done").forEach((t: any) => {
      if (isSameDay(new Date(t.due_date), day)) items.push({ type: "task", title: t.title, color: "bg-accent" });
    });
    return items;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-semibold min-w-[140px] text-center">
            {view === "day" ? format(current, "EEEE, MMM d") : view === "week" ? `Week of ${format(days[0], "MMM d")}` : format(current, "MMMM yyyy")}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-1">
          {(["day", "week", "month"] as CalView[]).map(v => (
            <Button key={v} variant={view === v ? "default" : "outline"} size="sm" className="text-xs capitalize" onClick={() => setView(v)}>{v}</Button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      {view === "month" ? (
        <div>
          <div className="grid grid-cols-7 gap-px">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
              <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
            ))}
            {days.map((day, i) => {
              const events = getEventsForDay(day);
              return (
                <div
                  key={i}
                  className={`min-h-[80px] md:min-h-[100px] border border-border p-1 ${!isSameMonth(day, current) ? "opacity-40" : ""} ${isToday(day) ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
                >
                  <span className={`text-xs font-medium ${isToday(day) ? "text-primary font-bold" : ""}`}>{format(day, "d")}</span>
                  <div className="mt-1 space-y-0.5">
                    {events.slice(0, 3).map((e, j) => (
                      <div key={j} className="flex items-center gap-1 truncate">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.color}`} />
                        <span className="text-[10px] truncate">{e.title}</span>
                      </div>
                    ))}
                    {events.length > 3 && <span className="text-[10px] text-muted-foreground">+{events.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {days.map((day, i) => {
            const events = getEventsForDay(day);
            return (
              <Card key={i} className={isToday(day) ? "ring-1 ring-primary/30" : ""}>
                <CardContent className="p-4">
                  <p className={`text-sm font-semibold mb-2 ${isToday(day) ? "text-primary" : ""}`}>
                    {format(day, "EEEE, MMM d")} {isToday(day) && <Badge variant="secondary" className="ml-1 text-xs">Today</Badge>}
                  </p>
                  {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No events</p>
                  ) : (
                    <div className="space-y-1.5">
                      {events.map((e, j) => (
                        <div key={j} className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${e.color}`} />
                          <span className="text-sm">{e.title}</span>
                          {e.time && <span className="text-xs text-muted-foreground ml-auto">{e.time}</span>}
                        </div>
                      ))}
                    </div>
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

// ── Main Plan Page ──
export default function PlanPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const defaultTab = searchParams.get("tab") || "today";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [voiceCommand, setVoiceCommand] = useState<ParsedVoiceCommand | null>(null);

  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: taskService.list });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: reminderService.list });
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingService.list });

  // ── Add dialogs state ──
  const [addType, setAddType] = useState<"task" | "reminder" | "meeting" | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [reminderTime, setReminderTime] = useState("");

  const createTaskMut = useMutation({
    mutationFn: (t: TaskInsert) => taskService.create(t),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); closeDialog(); toast.success("Task created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const createReminderMut = useMutation({
    mutationFn: (r: ReminderInsert) => reminderService.create(r),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders"] }); closeDialog(); toast.success("Reminder created"); },
    onError: (e: any) => toast.error(e.message),
  });
  const createMeetingMut = useMutation({
    mutationFn: (m: MeetingInsert) => meetingService.create(m),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); closeDialog(); toast.success("Meeting created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => taskService.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Deleted"); },
  });
  const deleteReminderMut = useMutation({
    mutationFn: (id: string) => reminderService.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders"] }); toast.success("Deleted"); },
  });
  const deleteMeetingMut = useMutation({
    mutationFn: (id: string) => meetingService.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Deleted"); },
  });

  const updateTaskStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => taskService.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const toggleReminderMut = useMutation({
    mutationFn: ({ id, is_done }: { id: string; is_done: boolean }) => reminderService.toggleDone(id, is_done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reminders"] }),
  });

  const closeDialog = () => { setAddType(null); setTitle(""); setPriority("medium"); setDescription(""); setStartTime(""); setEndTime(""); setLocation(""); setReminderTime(""); };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const openAdd = (type: "task" | "reminder" | "meeting") => setAddType(type);

  const isLoading = tasks.isLoading || reminders.isLoading || meetings.isLoading;

  const handleVoiceTranscript = useCallback((text: string) => {
    const cmd = parseVoiceCommand(text);
    if (cmd.intent === "open_page" && cmd.page) {
      navigate(cmd.page);
      toast.success(`Opening ${cmd.page}`);
      return;
    }
    if (cmd.intent === "run_briefing") {
      navigate("/");
      toast.success("Opening daily briefing");
      return;
    }
    if (cmd.intent === "unknown") {
      toast.error("Didn't understand that. Try: 'Add task: review report tomorrow'");
      return;
    }
    setVoiceCommand(cmd);
  }, [navigate]);

  const handleVoiceConfirm = useCallback(async (cmd: ParsedVoiceCommand) => {
    try {
      if (cmd.intent === "create_task") {
        await taskService.create({ title: cmd.title ?? "Untitled", priority: "medium", due_date: cmd.date?.toISOString() });
        toast.success("Task created via voice");
      } else if (cmd.intent === "create_reminder") {
        await reminderService.create({ title: cmd.title ?? "Untitled", reminder_time: (cmd.date ?? new Date()).toISOString() });
        toast.success("Reminder created via voice");
      } else if (cmd.intent === "create_meeting") {
        const start = cmd.date ?? new Date();
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        await meetingService.create({ title: cmd.title ?? "Untitled", start_time: start.toISOString(), end_time: end.toISOString() });
        toast.success("Meeting created via voice");
      } else if (cmd.intent === "add_expense") {
        await financeEntryService.create({ type: "expense", amount: cmd.amount ?? 0, category: cmd.title ?? "general", entry_date: (cmd.date ?? new Date()).toISOString().split("T")[0] });
        toast.success("Expense added via voice");
      } else if (cmd.intent === "add_income") {
        await financeEntryService.create({ type: "income", amount: cmd.amount ?? 0, category: cmd.title ?? "general", entry_date: (cmd.date ?? new Date()).toISOString().split("T")[0] });
        toast.success("Income added via voice");
      }
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    }
    setVoiceCommand(null);
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plan</h1>
          <p className="text-sm text-muted-foreground">Your unified planning command center</p>
        </div>
        <VoiceInput onTranscript={handleVoiceTranscript} />
      </div>

      {/* Voice confirmation card */}
      {voiceCommand && (
        <VoiceConfirmation
          command={voiceCommand}
          onConfirm={handleVoiceConfirm}
          onCancel={() => setVoiceCommand(null)}
        />
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="today" className="gap-1"><Target className="h-3.5 w-3.5 hidden sm:inline" /> Today</TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1"><CheckSquare className="h-3.5 w-3.5 hidden sm:inline" /> Tasks</TabsTrigger>
            <TabsTrigger value="reminders" className="gap-1"><Bell className="h-3.5 w-3.5 hidden sm:inline" /> Reminders</TabsTrigger>
            <TabsTrigger value="meetings" className="gap-1"><Clock className="h-3.5 w-3.5 hidden sm:inline" /> Meetings</TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1"><CalendarIcon className="h-3.5 w-3.5 hidden sm:inline" /> Calendar</TabsTrigger>
          </TabsList>
        </div>

        {/* TODAY */}
        <TabsContent value="today">
          <TodayTab tasks={tasks.data} reminders={reminders.data} meetings={meetings.data} isLoading={isLoading} onAdd={openAdd} />
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">All Tasks</h2>
              <Button size="sm" className="gap-1" onClick={() => openAdd("task")}><Plus className="h-4 w-4" /> Add Task</Button>
            </div>
            {tasks.isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div> :
            (tasks.data ?? []).length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No tasks yet</CardContent></Card> :
            <div className="space-y-2">
              {(tasks.data ?? []).map((t: any) => (
                <Card key={t.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" checked={t.status === "done"} onChange={() => updateTaskStatusMut.mutate({ id: t.id, status: t.status === "done" ? "pending" : "done" })} className="h-4 w-4 shrink-0 rounded border-border" />
                      <div className="min-w-0">
                        <span className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                        {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                        <ClientTagPicker entityType="task" entityId={t.id} compact />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ClientTagPicker entityType="task" entityId={t.id} />
                      <Badge variant="secondary" className={priorityColor[t.priority] ?? ""}>{t.priority}</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteTaskMut.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>}
          </div>
        </TabsContent>

        {/* REMINDERS */}
        <TabsContent value="reminders">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">All Reminders</h2>
              <Button size="sm" className="gap-1" onClick={() => openAdd("reminder")}><Plus className="h-4 w-4" /> Add Reminder</Button>
            </div>
            {reminders.isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div> :
            (reminders.data ?? []).length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No reminders</CardContent></Card> :
            <div className="space-y-2">
              {(reminders.data ?? []).map((r: any) => (
                <Card key={r.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" checked={r.is_done} onChange={() => toggleReminderMut.mutate({ id: r.id, is_done: !r.is_done })} className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <span className={`text-sm font-medium ${r.is_done ? "line-through text-muted-foreground" : ""}`}>{r.title}</span>
                        <p className="text-xs text-muted-foreground"><Bell className="mr-1 inline h-3 w-3" />{format(new Date(r.reminder_time), "MMM d, h:mm a")}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteReminderMut.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>}
          </div>
        </TabsContent>

        {/* MEETINGS */}
        <TabsContent value="meetings">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">All Meetings</h2>
              <Button size="sm" className="gap-1" onClick={() => openAdd("meeting")}><Plus className="h-4 w-4" /> Add Meeting</Button>
            </div>
            {meetings.isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div> :
            (meetings.data ?? []).length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No meetings</CardContent></Card> :
            <div className="space-y-2">
              {(meetings.data ?? []).map((m: any) => (
                <Card key={m.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{m.title}</span>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(m.start_time), "MMM d, h:mm a")}</span>
                        {m.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.location}</span>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteMeetingMut.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>}
          </div>
        </TabsContent>

        {/* CALENDAR */}
        <TabsContent value="calendar">
          <CalendarTab tasks={tasks.data} reminders={reminders.data} meetings={meetings.data} onAdd={openAdd} />
        </TabsContent>
      </Tabs>

      {/* Quick Add FAB - mobile */}
      <QuickAddFab onAdd={openAdd} />

      {/* Unified add dialog */}
      <Dialog open={addType !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {addType === "task" ? "New Task" : addType === "reminder" ? "New Reminder" : "New Meeting"}
            </DialogTitle>
          </DialogHeader>
          {addType === "task" && (
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); createTaskMut.mutate({ title, priority, description: description || undefined }); }}>
              <Input placeholder="Task title" value={title} onChange={e => setTitle(e.target.value)} required />
              <Input placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full" disabled={createTaskMut.isPending}>Create Task</Button>
            </form>
          )}
          {addType === "reminder" && (
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); createReminderMut.mutate({ title, reminder_time: new Date(reminderTime).toISOString() }); }}>
              <Input placeholder="Reminder title" value={title} onChange={e => setTitle(e.target.value)} required />
              <Input type="datetime-local" value={reminderTime} onChange={e => setReminderTime(e.target.value)} required />
              <Button type="submit" className="w-full" disabled={createReminderMut.isPending}>Create Reminder</Button>
            </form>
          )}
          {addType === "meeting" && (
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); createMeetingMut.mutate({ title, start_time: new Date(startTime).toISOString(), end_time: new Date(endTime).toISOString(), location: location || undefined }); }}>
              <Input placeholder="Meeting title" value={title} onChange={e => setTitle(e.target.value)} required />
              <div className="grid grid-cols-2 gap-2">
                <Input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} required />
                <Input type="datetime-local" value={endTime} onChange={e => setEndTime(e.target.value)} required />
              </div>
              <Input placeholder="Location (optional)" value={location} onChange={e => setLocation(e.target.value)} />
              <Button type="submit" className="w-full" disabled={createMeetingMut.isPending}>Create Meeting</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
