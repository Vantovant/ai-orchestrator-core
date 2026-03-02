import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { taskService, type Task, type TaskInsert } from "@/services/taskService";
import { projectService } from "@/services/projectService";
import { reminderService, type Reminder, type ReminderInsert } from "@/services/reminderService";
import { meetingService, type Meeting, type MeetingInsert } from "@/services/meetingService";
import { financeEntryService } from "@/services/financeService";
import { secretaryService, type SecretarySettings } from "@/services/secretaryService";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CheckSquare, Bell, Calendar as CalendarIcon, Clock, MapPin,
  Plus, Trash2, Target, ChevronLeft, ChevronRight, BookOpen, Sparkles, Search, FolderKanban
} from "lucide-react";
import { toast } from "sonner";
import ComplianceWidget from "@/components/compliance/ComplianceWidget";
import ClientTagPicker from "@/components/clients/ClientTagPicker";
import VoiceInput from "@/components/voice/VoiceInput";
import VoiceConfirmation from "@/components/voice/VoiceConfirmation";
import { parseVoiceCommand, type ParsedVoiceCommand } from "@/lib/voiceCommandParser";
import { addVoiceHistoryEntry } from "@/lib/voiceHistory";
import TaskDetailDrawer from "@/components/plan/TaskDetailDrawer";
import ReminderDetailDrawer from "@/components/plan/ReminderDetailDrawer";
import MeetingDetailDrawer from "@/components/plan/MeetingDetailDrawer";
import NotesTab from "@/components/plan/NotesTab";
import SecretaryBriefing from "@/components/plan/SecretaryBriefing";
import PlanCommandBar from "@/components/plan/PlanCommandBar";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, isSameDay, isSameMonth, isToday as isDateToday } from "date-fns";

const priorityColor: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-primary text-primary-foreground",
  low: "bg-muted text-muted-foreground",
};

// ── Quick Add FAB (mobile) ──
function QuickAddFab({ onAdd, onVoiceTranscript }: { onAdd: (type: "task" | "reminder" | "meeting") => void; onVoiceTranscript: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-20 right-4 z-40 md:hidden">
      {open && (
        <div className="mb-2 flex flex-col gap-2 animate-in slide-in-from-bottom-2">
          <div className="flex justify-end">
            <VoiceInput onTranscript={onVoiceTranscript} compact />
          </div>
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
function TodayTab({ tasks, reminders, meetings, isLoading, onAdd, onClickTask, onClickReminder, onClickMeeting }: {
  tasks: Task[]; reminders: Reminder[]; meetings: Meeting[]; isLoading: boolean;
  onAdd: (t: "task" | "reminder" | "meeting") => void;
  onClickTask: (t: Task) => void; onClickReminder: (r: Reminder) => void; onClickMeeting: (m: Meeting) => void;
}) {
  const now = new Date();
  const todayMeetings = (meetings ?? []).filter((m) => isSameDay(new Date(m.start_time), now));
  const urgentReminders = (reminders ?? []).filter((r) => !r.is_done && new Date(r.reminder_time).getTime() - now.getTime() < 48 * 60 * 60 * 1000);
  const priorityOrder = ["critical", "high", "medium", "low"];
  const topTasks = (tasks ?? [])
    .filter((t) => t.status !== "done")
    .sort((a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority))
    .slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onAdd("meeting")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{todayMeetings.length}</p>
            <p className="text-xs text-muted-foreground">Meetings</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onAdd("reminder")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{urgentReminders.length}</p>
            <p className="text-xs text-muted-foreground">Urgent</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onAdd("task")}>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{topTasks.length}</p>
            <p className="text-xs text-muted-foreground">Priorities</p>
          </CardContent>
        </Card>
      </div>

      <div className="hidden md:flex gap-2 items-center">
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onAdd("task")}><Plus className="h-3 w-3" /> Task</Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onAdd("reminder")}><Plus className="h-3 w-3" /> Reminder</Button>
        <Button variant="outline" size="sm" className="gap-1" onClick={() => onAdd("meeting")}><Plus className="h-3 w-3" /> Meeting</Button>
      </div>

      {/* Top Priorities - CLICKABLE */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Top Priorities</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-20" /> : topTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks yet. <Button variant="link" className="p-0 h-auto text-sm" onClick={() => onAdd("task")}>Add one</Button></p>
          ) : (
            <div className="space-y-2">
              {topTasks.map((t, i) => (
                <button
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 w-full text-left hover:bg-muted/50 active:scale-[0.99] transition-all cursor-pointer"
                  onClick={() => onClickTask(t)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                    <span className="text-sm font-medium truncate">{t.title}</span>
                  </div>
                  <Badge variant="secondary" className={`shrink-0 ${priorityColor[t.priority] ?? ""}`}>{t.priority}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Meetings - CLICKABLE */}
      {todayMeetings.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Today's Meetings</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {todayMeetings.map((m) => (
              <button
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-border p-3 w-full text-left hover:bg-muted/50 active:scale-[0.99] transition-all cursor-pointer"
                onClick={() => onClickMeeting(m)}
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium">{m.title}</span>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(m.start_time), "h:mm a")}
                    {m.location ? ` · ${m.location}` : ""}
                  </p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Urgent Reminders - CLICKABLE */}
      {urgentReminders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-warning" /> Urgent Reminders</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {urgentReminders.map((r) => (
              <button
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-border p-3 w-full text-left hover:bg-muted/50 active:scale-[0.99] transition-all cursor-pointer"
                onClick={() => onClickReminder(r)}
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium">{r.title}</span>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.reminder_time), "MMM d, h:mm a")}</p>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <ComplianceWidget compact />
    </div>
  );
}

// ── Calendar Tab ──
type CalView = "day" | "week" | "month";
function CalendarTab({ tasks, reminders, meetings, onClickTask, onClickReminder, onClickMeeting }: {
  tasks: Task[]; reminders: Reminder[]; meetings: Meeting[];
  onClickTask: (t: Task) => void; onClickReminder: (r: Reminder) => void; onClickMeeting: (m: Meeting) => void;
}) {
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
    const items: { type: string; title: string; time?: string; color: string; item: any }[] = [];
    (meetings ?? []).forEach((m) => {
      if (isSameDay(new Date(m.start_time), day)) items.push({ type: "meeting", title: m.title, time: format(new Date(m.start_time), "h:mm a"), color: "bg-primary", item: m });
    });
    (reminders ?? []).filter((r) => !r.is_done).forEach((r) => {
      if (isSameDay(new Date(r.reminder_time), day)) items.push({ type: "reminder", title: r.title, time: format(new Date(r.reminder_time), "h:mm a"), color: "bg-warning", item: r });
    });
    (tasks ?? []).filter((t) => t.due_date && t.status !== "done").forEach((t) => {
      if (isSameDay(new Date(t.due_date!), day)) items.push({ type: "task", title: t.title, color: "bg-accent", item: t });
    });
    return items;
  };

  const handleEventClick = (event: any) => {
    if (event.type === "task") onClickTask(event.item);
    else if (event.type === "reminder") onClickReminder(event.item);
    else if (event.type === "meeting") onClickMeeting(event.item);
  };

  return (
    <div className="space-y-4">
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

      {view === "month" ? (
        <div className="grid grid-cols-7 gap-px">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
            <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
          {days.map((day, i) => {
            const events = getEventsForDay(day);
            return (
              <div
                key={i}
                className={`min-h-[80px] md:min-h-[100px] border border-border p-1 ${!isSameMonth(day, current) ? "opacity-40" : ""} ${isDateToday(day) ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}
              >
                <span className={`text-xs font-medium ${isDateToday(day) ? "text-primary font-bold" : ""}`}>{format(day, "d")}</span>
                <div className="mt-1 space-y-0.5">
                  {events.slice(0, 3).map((e, j) => (
                    <button key={j} className="flex items-center gap-1 truncate w-full text-left hover:bg-muted/50 rounded px-0.5" onClick={() => handleEventClick(e)}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.color}`} />
                      <span className="text-[10px] truncate">{e.title}</span>
                    </button>
                  ))}
                  {events.length > 3 && <span className="text-[10px] text-muted-foreground">+{events.length - 3} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {days.map((day, i) => {
            const events = getEventsForDay(day);
            return (
              <Card key={i} className={isDateToday(day) ? "ring-1 ring-primary/30" : ""}>
                <CardContent className="p-4">
                  <p className={`text-sm font-semibold mb-2 ${isDateToday(day) ? "text-primary" : ""}`}>
                    {format(day, "EEEE, MMM d")} {isDateToday(day) && <Badge variant="secondary" className="ml-1 text-xs">Today</Badge>}
                  </p>
                  {events.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No events</p>
                  ) : (
                    <div className="space-y-1.5">
                      {events.map((e, j) => (
                        <button key={j} className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded p-1 transition-colors" onClick={() => handleEventClick(e)}>
                          <span className={`h-2 w-2 shrink-0 rounded-full ${e.color}`} />
                          <span className="text-sm">{e.title}</span>
                          {e.time && <span className="text-xs text-muted-foreground ml-auto">{e.time}</span>}
                        </button>
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

  // Detail drawer state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);

  // Secretary mode
  const [secretaryMode, setSecretaryMode] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Command bar
  const [commandBarOpen, setCommandBarOpen] = useState(false);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandBarOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Search/filter state for lists
  const [taskSearch, setTaskSearch] = useState("");
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [reminderFilter, setReminderFilter] = useState<string>("all");
  const [meetingSearch, setMeetingSearch] = useState("");

  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: taskService.list });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: reminderService.list });
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingService.list });
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectService.list });

  // Build project name lookup
  const projectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    (projects.data ?? []).forEach(p => { map[p.id] = p.name; });
    return map;
  }, [projects.data]);

  // Load secretary settings
  useEffect(() => {
    secretaryService.getSettings().then((s) => {
      setSecretaryMode(s.secretary_mode);
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  const toggleSecretaryMode = async (val: boolean) => {
    setSecretaryMode(val);
    try {
      const current = await secretaryService.getSettings();
      await secretaryService.saveSettings({ ...current, secretary_mode: val });
      toast.success(val ? "Secretary Mode ON" : "Secretary Mode OFF");
    } catch {
      toast.error("Failed to save setting");
    }
  };

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

  const updateTaskMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => taskService.update(id, updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Updated"); },
  });
  const updateMeetingMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => meetingService.update(id, updates),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Updated"); },
  });
  const toggleReminderMut = useMutation({
    mutationFn: ({ id, is_done }: { id: string; is_done: boolean }) => reminderService.toggleDone(id, is_done),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reminders"] }); toast.success("Updated"); },
  });

  const closeDialog = () => { setAddType(null); setTitle(""); setPriority("medium"); setDescription(""); setStartTime(""); setEndTime(""); setLocation(""); setReminderTime(""); };

  const handleTabChange = (tab: string) => { setActiveTab(tab); setSearchParams({ tab }); };
  const openAdd = (type: "task" | "reminder" | "meeting") => setAddType(type);
  const isLoading = tasks.isLoading || reminders.isLoading || meetings.isLoading;

  const handleVoiceTranscript = useCallback((text: string) => {
    const cmd = parseVoiceCommand(text);
    addVoiceHistoryEntry({ transcript: text, intent: cmd.intent });
    if (cmd.intent === "open_page" && cmd.page) { navigate(cmd.page); toast.success(`Opening ${cmd.page}`); return; }
    if (cmd.intent === "run_briefing") { navigate("/"); toast.success("Opening daily briefing"); return; }
    if (cmd.intent === "unknown") { toast.error("Didn't understand that. Try: 'I need to review the report tomorrow'"); return; }
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
        const durationMs = (cmd.duration ?? 30) * 60 * 1000;
        const end = new Date(start.getTime() + durationMs);
        await meetingService.create({ title: cmd.title ?? "Untitled", start_time: start.toISOString(), end_time: end.toISOString(), location: cmd.location ?? undefined });
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
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Plan</h1>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d yyyy")}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Command Bar Trigger */}
          <Button variant="outline" size="sm" className="gap-1.5 hidden md:flex" onClick={() => setCommandBarOpen(true)}>
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs text-muted-foreground">Search</span>
            <kbd className="pointer-events-none ml-1 inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
          </Button>
          {/* Secretary Mode Toggle */}
          <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 bg-card">
            <Sparkles className={`h-4 w-4 ${secretaryMode ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-xs font-medium hidden sm:inline">Secretary</span>
            <Switch checked={secretaryMode} onCheckedChange={toggleSecretaryMode} />
          </div>
          <VoiceInput onTranscript={handleVoiceTranscript} />
        </div>
      </div>

      {/* Secretary Morning Briefing */}
      <SecretaryBriefing enabled={secretaryMode} />

      {/* Voice confirmation card */}
      {voiceCommand && (
        <VoiceConfirmation command={voiceCommand} onConfirm={handleVoiceConfirm} onCancel={() => setVoiceCommand(null)} />
      )}

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="today" className="gap-1"><Target className="h-3.5 w-3.5 hidden sm:inline" /> Today</TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1"><CheckSquare className="h-3.5 w-3.5 hidden sm:inline" /> Tasks</TabsTrigger>
            <TabsTrigger value="reminders" className="gap-1"><Bell className="h-3.5 w-3.5 hidden sm:inline" /> Reminders</TabsTrigger>
            <TabsTrigger value="meetings" className="gap-1"><Clock className="h-3.5 w-3.5 hidden sm:inline" /> Meetings</TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1"><CalendarIcon className="h-3.5 w-3.5 hidden sm:inline" /> Calendar</TabsTrigger>
            <TabsTrigger value="notes" className="gap-1"><BookOpen className="h-3.5 w-3.5 hidden sm:inline" /> Notes</TabsTrigger>
          </TabsList>
        </div>

        {/* TODAY */}
        <TabsContent value="today">
          <TodayTab
            tasks={tasks.data ?? []} reminders={reminders.data ?? []} meetings={meetings.data ?? []}
            isLoading={isLoading} onAdd={openAdd}
            onClickTask={setSelectedTask} onClickReminder={setSelectedReminder} onClickMeeting={setSelectedMeeting}
          />
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">All Tasks</h2>
              <Button size="sm" className="gap-1" onClick={() => openAdd("task")}><Plus className="h-4 w-4" /> Add Task</Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Search tasks..." value={taskSearch} onChange={e => setTaskSearch(e.target.value)} className="max-w-[200px] h-8 text-xs" />
              <Select value={taskFilter} onValueChange={setTaskFilter}>
                <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tasks.isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div> :
            (() => {
              const filtered = (tasks.data ?? []).filter(t => {
                if (taskSearch && !t.title.toLowerCase().includes(taskSearch.toLowerCase())) return false;
                if (taskFilter === "pending") return t.status !== "done";
                if (taskFilter === "done") return t.status === "done";
                if (taskFilter === "critical") return t.priority === "critical";
                if (taskFilter === "high") return t.priority === "high";
                return true;
              });
              return filtered.length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No tasks match</CardContent></Card> :
              <div className="space-y-2">
                {filtered.map((t) => (
                  <Card key={t.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedTask(t)}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <input type="checkbox" checked={t.status === "done"}
                          onChange={(e) => { e.stopPropagation(); updateTaskMut.mutate({ id: t.id, updates: { status: t.status === "done" ? "pending" : "done" } }); }}
                          onClick={(e) => e.stopPropagation()} className="h-4 w-4 shrink-0 rounded border-border" />
                        <div className="min-w-0">
                          <span className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                          {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                          {t.project_id && projectNameMap[t.project_id] && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary mt-0.5"><FolderKanban className="h-2.5 w-2.5" />{projectNameMap[t.project_id]}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className={priorityColor[t.priority] ?? ""}>{t.priority}</Badge>
                        {t.due_date && <span className="text-xs text-muted-foreground hidden md:inline">{format(new Date(t.due_date), "MMM d")}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>;
            })()}
          </div>
        </TabsContent>

        {/* REMINDERS */}
        <TabsContent value="reminders">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">All Reminders</h2>
              <Button size="sm" className="gap-1" onClick={() => openAdd("reminder")}><Plus className="h-4 w-4" /> Add Reminder</Button>
            </div>
            <Select value={reminderFilter} onValueChange={setReminderFilter}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            {reminders.isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div> :
            (() => {
              const now = new Date();
              const filtered = (reminders.data ?? []).filter(r => {
                if (reminderFilter === "upcoming") return !r.is_done && new Date(r.reminder_time) >= now;
                if (reminderFilter === "done") return r.is_done;
                if (reminderFilter === "overdue") return !r.is_done && new Date(r.reminder_time) < now;
                return true;
              });
              return filtered.length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No reminders match</CardContent></Card> :
              <div className="space-y-2">
                {filtered.map((r) => (
                  <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedReminder(r)}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <input type="checkbox" checked={r.is_done}
                          onChange={(e) => { e.stopPropagation(); toggleReminderMut.mutate({ id: r.id, is_done: !r.is_done }); }}
                          onClick={(e) => e.stopPropagation()} className="h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <span className={`text-sm font-medium ${r.is_done ? "line-through text-muted-foreground" : ""}`}>{r.title}</span>
                          <p className="text-xs text-muted-foreground"><Bell className="mr-1 inline h-3 w-3" />{format(new Date(r.reminder_time), "MMM d, h:mm a")}</p>
                          {r.project_id && projectNameMap[r.project_id] && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary mt-0.5"><FolderKanban className="h-2.5 w-2.5" />{projectNameMap[r.project_id]}</span>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>;
            })()}
          </div>
        </TabsContent>

        {/* MEETINGS */}
        <TabsContent value="meetings">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">All Meetings</h2>
              <Button size="sm" className="gap-1" onClick={() => openAdd("meeting")}><Plus className="h-4 w-4" /> Add Meeting</Button>
            </div>
            <Input placeholder="Search meetings..." value={meetingSearch} onChange={e => setMeetingSearch(e.target.value)} className="max-w-[200px] h-8 text-xs" />
            {meetings.isLoading ? <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16" />)}</div> :
            (() => {
              const filtered = (meetings.data ?? []).filter(m =>
                !meetingSearch || m.title.toLowerCase().includes(meetingSearch.toLowerCase())
              );
              return filtered.length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">No meetings match</CardContent></Card> :
              <div className="space-y-2">
                {filtered.map((m) => (
                  <Card key={m.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedMeeting(m)}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{m.title}</span>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{format(new Date(m.start_time), "MMM d, h:mm a")}</span>
                          {m.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.location}</span>}
                        </div>
                        {m.project_id && projectNameMap[m.project_id] && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-primary mt-0.5"><FolderKanban className="h-2.5 w-2.5" />{projectNameMap[m.project_id]}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>;
            })()}
          </div>
        </TabsContent>

        {/* CALENDAR */}
        <TabsContent value="calendar">
          <CalendarTab
            tasks={tasks.data ?? []} reminders={reminders.data ?? []} meetings={meetings.data ?? []}
            onClickTask={setSelectedTask} onClickReminder={setSelectedReminder} onClickMeeting={setSelectedMeeting}
          />
        </TabsContent>

        {/* NOTES */}
        <TabsContent value="notes">
          <NotesTab secretaryMode={secretaryMode} />
        </TabsContent>
      </Tabs>

      {/* Command Bar */}
      <PlanCommandBar
        open={commandBarOpen} onClose={() => setCommandBarOpen(false)}
        tasks={tasks.data ?? []} reminders={reminders.data ?? []} meetings={meetings.data ?? []}
        onClickTask={(t) => { setSelectedTask(t); setCommandBarOpen(false); }}
        onClickReminder={(r) => { setSelectedReminder(r); setCommandBarOpen(false); }}
        onClickMeeting={(m) => { setSelectedMeeting(m); setCommandBarOpen(false); }}
        onAdd={(type) => { openAdd(type); setCommandBarOpen(false); }}
        onTabChange={(tab) => { handleTabChange(tab); setCommandBarOpen(false); }}
        onVoiceTranscript={handleVoiceTranscript}
      />

      {/* Quick Add FAB - mobile */}
      <QuickAddFab onAdd={openAdd} onVoiceTranscript={handleVoiceTranscript} />

      {/* Detail Drawers */}
      <TaskDetailDrawer
        task={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)}
        onUpdate={(id, updates) => { updateTaskMut.mutate({ id, updates }); setSelectedTask(null); }}
        onDelete={(id) => { deleteTaskMut.mutate(id); setSelectedTask(null); }}
      />
      <ReminderDetailDrawer
        reminder={selectedReminder} open={!!selectedReminder} onClose={() => setSelectedReminder(null)}
        onToggle={(id, isDone) => { toggleReminderMut.mutate({ id, is_done: isDone }); setSelectedReminder(null); }}
        onDelete={(id) => { deleteReminderMut.mutate(id); setSelectedReminder(null); }}
        onMeetingCreated={() => qc.invalidateQueries({ queryKey: ["meetings"] })}
      />
      <MeetingDetailDrawer
        meeting={selectedMeeting} open={!!selectedMeeting} onClose={() => setSelectedMeeting(null)}
        onUpdate={(id, updates) => { updateMeetingMut.mutate({ id, updates }); setSelectedMeeting(null); }}
        onDelete={(id) => { deleteMeetingMut.mutate(id); setSelectedMeeting(null); }}
      />

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
