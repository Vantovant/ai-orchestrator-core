import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectService, projectNotesService, projectLinksService,
  type Project, type ProjectNote, type ProjectLink,
} from "@/services/projectService";
import { taskService, type Task, type TaskInsert } from "@/services/taskService";
import { meetingService, type Meeting, type MeetingInsert } from "@/services/meetingService";
import { reminderService, type ReminderInsert } from "@/services/reminderService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TaskDetailDrawer from "@/components/plan/TaskDetailDrawer";
import MeetingDetailDrawer from "@/components/plan/MeetingDetailDrawer";
import DictationMic from "@/components/plan/DictationMic";
import {
  ArrowLeft, CheckCircle2, CircleDot, PauseCircle, AlertTriangle,
  Plus, Link2, Trash2, ExternalLink, Target, Calendar, FileText,
  Clock, Save, Sparkles, FolderKanban, Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  projectId: string;
  onBack: () => void;
}

export default function ProjectDetailPage({ projectId, onBack }: Props) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [editing, setEditing] = useState(false);

  // Edit state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editStatus, setEditStatus] = useState("active");

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projectService.get(projectId),
  });

  const linkedTasks = useQuery({
    queryKey: ["project_tasks", projectId],
    queryFn: () => projectService.getLinkedTasks(projectId),
  });

  const linkedMeetings = useQuery({
    queryKey: ["project_meetings", projectId],
    queryFn: () => projectService.getLinkedMeetings(projectId),
  });

  const links = useQuery({
    queryKey: ["project_links", projectId],
    queryFn: () => projectLinksService.list(projectId),
  });

  const updateProjectMut = useMutation({
    mutationFn: (updates: any) => projectService.update(projectId, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      setEditing(false);
      toast.success("Updated");
    },
  });

  const deleteProjectMut = useMutation({
    mutationFn: () => projectService.softDelete(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
      onBack();
    },
  });

  // Task mutations
  const createTaskMut = useMutation({
    mutationFn: (t: TaskInsert & { project_id?: string }) => taskService.create(t),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
    },
  });

  const updateTaskMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => taskService.update(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Updated");
    },
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => taskService.softDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Deleted");
    },
  });

  // Meeting mutations
  const createMeetingMut = useMutation({
    mutationFn: (m: MeetingInsert & { project_id?: string }) => meetingService.create(m),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_meetings", projectId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting created");
    },
  });

  const updateMeetingMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => meetingService.update(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_meetings", projectId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Updated");
    },
  });

  const deleteMeetingMut = useMutation({
    mutationFn: (id: string) => meetingService.softDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_meetings", projectId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Deleted");
    },
  });

  // Link mutations
  const addLinkMut = useMutation({
    mutationFn: ({ label, url }: { label: string; url: string }) => projectLinksService.create(projectId, label, url),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_links", projectId] });
      toast.success("Link added");
    },
  });

  const removeLinkMut = useMutation({
    mutationFn: (id: string) => projectLinksService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_links", projectId] });
      toast.success("Link removed");
    },
  });

  const startEdit = () => {
    if (!project.data) return;
    setEditName(project.data.name);
    setEditDesc(project.data.description || "");
    setEditStatus(project.data.status);
    setEditing(true);
  };

  if (project.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!project.data) return <div className="text-center py-12 text-muted-foreground">Project not found</div>;

  const p = project.data;
  const tasks = linkedTasks.data ?? [];
  const meetings = linkedMeetings.data ?? [];
  const doneTasks = tasks.filter((t: any) => t.status === "done").length;
  const progress = p.progress_mode === "tasks_based" && tasks.length > 0
    ? Math.round((doneTasks / tasks.length) * 100)
    : p.progress_manual;

  const overdueTasks = tasks.filter((t: any) => t.status !== "done" && t.due_date && new Date(t.due_date) < new Date());
  const health = p.is_blocked ? "red" : overdueTasks.length >= 2 ? "red" : overdueTasks.length >= 1 ? "amber" : "green";
  const healthColors = { green: "text-success", amber: "text-warning", red: "text-destructive" };
  const healthLabels = { green: "On Track", amber: "At Risk", red: "Blocked" };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{p.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className={`text-xs gap-1 ${healthColors[health]}`}>
              {health === "green" ? <CircleDot className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {healthLabels[health]}
            </Badge>
            <Badge variant="secondary" className="text-xs capitalize">{p.status}</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm"><Target className="h-3.5 w-3.5 hidden sm:inline" /> Overview</TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1 text-xs sm:text-sm"><CheckCircle2 className="h-3.5 w-3.5 hidden sm:inline" /> Tasks</TabsTrigger>
            <TabsTrigger value="meetings" className="gap-1 text-xs sm:text-sm"><Calendar className="h-3.5 w-3.5 hidden sm:inline" /> Meetings</TabsTrigger>
            <TabsTrigger value="notes" className="gap-1 text-xs sm:text-sm"><FileText className="h-3.5 w-3.5 hidden sm:inline" /> Notes</TabsTrigger>
            <TabsTrigger value="links" className="gap-1 text-xs sm:text-sm"><Link2 className="h-3.5 w-3.5 hidden sm:inline" /> Links</TabsTrigger>
          </TabsList>
        </div>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          <OverviewTab
            project={p}
            progress={progress}
            tasks={tasks}
            meetings={meetings}
            health={health}
            onClickTask={(t: any) => setSelectedTask(t)}
            onClickMeeting={(m: any) => setSelectedMeeting(m)}
            onUpdateProgress={(val: number) => updateProjectMut.mutate({ progress_manual: val })}
            onToggleBlocked={() => updateProjectMut.mutate({ is_blocked: !p.is_blocked })}
          />
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks">
          <ProjectTasksTab
            tasks={tasks}
            loading={linkedTasks.isLoading}
            projectId={projectId}
            onClickTask={(t: any) => setSelectedTask(t)}
            onCreateTask={(title: string) => createTaskMut.mutate({ title, project_id: projectId } as any)}
            onToggleTask={(id: string, status: string) => updateTaskMut.mutate({ id, updates: { status: status === "done" ? "pending" : "done" } })}
          />
        </TabsContent>

        {/* MEETINGS */}
        <TabsContent value="meetings">
          <ProjectMeetingsTab
            meetings={meetings}
            loading={linkedMeetings.isLoading}
            projectId={projectId}
            onClickMeeting={(m: any) => setSelectedMeeting(m)}
            onCreateMeeting={(title: string, start: string, end: string) =>
              createMeetingMut.mutate({ title, start_time: start, end_time: end, project_id: projectId } as any)
            }
          />
        </TabsContent>

        {/* NOTES */}
        <TabsContent value="notes">
          <ProjectNotesTab projectId={projectId} />
        </TabsContent>

        {/* LINKS */}
        <TabsContent value="links">
          <ProjectLinksTab
            links={links.data ?? []}
            loading={links.isLoading}
            onAdd={(label, url) => addLinkMut.mutate({ label, url })}
            onRemove={(id) => removeLinkMut.mutate(id)}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); updateProjectMut.mutate({ name: editName, description: editDesc, status: editStatus }); }}>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} />
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={updateProjectMut.isPending}>Save</Button>
              <Button type="button" variant="destructive" size="sm" onClick={() => deleteProjectMut.mutate()}>Delete</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail Drawers */}
      <TaskDetailDrawer
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdate={(id, updates) => updateTaskMut.mutate({ id, updates })}
        onDelete={(id) => deleteTaskMut.mutate(id)}
      />
      <MeetingDetailDrawer
        meeting={selectedMeeting}
        open={!!selectedMeeting}
        onClose={() => setSelectedMeeting(null)}
        onUpdate={(id, updates) => updateMeetingMut.mutate({ id, updates })}
        onDelete={(id) => deleteMeetingMut.mutate(id)}
      />
    </div>
  );
}

// ── Overview Tab ──
function OverviewTab({ project, progress, tasks, meetings, health, onClickTask, onClickMeeting, onUpdateProgress, onToggleBlocked }: any) {
  const openTasks = tasks.filter((t: any) => t.status !== "done").slice(0, 3);
  const upcomingMeetings = meetings.filter((m: any) => new Date(m.start_time) >= new Date()).slice(0, 3);

  return (
    <div className="space-y-4">
      {project.description && (
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">{project.description}</p></CardContent></Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Progress</span>
              <span className="text-sm font-bold text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            {project.progress_mode === "manual" && (
              <Slider
                value={[project.progress_manual]}
                max={100}
                step={5}
                onValueCommit={(v) => onUpdateProgress(v[0])}
              />
            )}
            <p className="text-[10px] text-muted-foreground capitalize">{project.progress_mode} mode</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 space-y-2">
            <span className="text-sm font-medium">Health</span>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${health === "green" ? "text-success" : health === "amber" ? "text-warning" : "text-destructive"}`}>
                {health === "green" ? "●" : health === "amber" ? "◐" : "■"}
              </span>
              <span className="text-sm capitalize">{health === "green" ? "On Track" : health === "amber" ? "At Risk" : "Blocked"}</span>
            </div>
            <Button variant="outline" size="sm" className="text-xs w-full" onClick={onToggleBlocked}>
              {project.is_blocked ? "Unblock" : "Mark Blocked"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Next actions */}
      {openTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Next Actions</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {openTasks.map((t: any) => (
              <button key={t.id} className="flex items-center gap-2 w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm" onClick={() => onClickTask(t)}>
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{t.title}</span>
                {t.due_date && <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{format(new Date(t.due_date), "MMM d")}</span>}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {upcomingMeetings.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Upcoming Meetings</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {upcomingMeetings.map((m: any) => (
              <button key={m.id} className="flex items-center gap-2 w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm" onClick={() => onClickMeeting(m)}>
                <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{m.title}</span>
                <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{format(new Date(m.start_time), "MMM d, h:mm a")}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Tasks Tab ──
function ProjectTasksTab({ tasks, loading, projectId, onClickTask, onCreateTask, onToggleTask }: any) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Project Tasks ({tasks.length})</h3>
        <Button size="sm" className="gap-1" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </div>
      {adding && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onCreateTask(title.trim()); setTitle(""); setAdding(false); } }}>
          <Input placeholder="Task title..." value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="h-9 text-sm" />
          <Button type="submit" size="sm">Add</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
        </form>
      )}
      {loading ? <Skeleton className="h-32" /> : tasks.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No tasks linked to this project yet.</CardContent></Card>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((t: any) => (
            <Card key={t.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => onClickTask(t)}>
              <CardContent className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={(e) => { e.stopPropagation(); onToggleTask(t.id, t.status); }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 shrink-0"
                />
                <span className={`text-sm flex-1 truncate ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                {t.due_date && <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(t.due_date), "MMM d")}</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Meetings Tab ──
function ProjectMeetingsTab({ meetings, loading, projectId, onClickMeeting, onCreateMeeting }: any) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Project Meetings ({meetings.length})</h3>
        <Button size="sm" className="gap-1" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add</Button>
      </div>
      {adding && (
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && startTime && endTime) { onCreateMeeting(title.trim(), new Date(startTime).toISOString(), new Date(endTime).toISOString()); setTitle(""); setStartTime(""); setEndTime(""); setAdding(false); }
        }}>
          <Input placeholder="Meeting title..." value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="h-9 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="h-9 text-sm" />
            <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {loading ? <Skeleton className="h-32" /> : meetings.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No meetings linked yet.</CardContent></Card>
      ) : (
        <div className="space-y-1.5">
          {meetings.map((m: any) => (
            <Card key={m.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => onClickMeeting(m)}>
              <CardContent className="flex items-center gap-3 p-3">
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium truncate block">{m.title}</span>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(m.start_time), "MMM d, h:mm a")}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notes Tab ──
function ProjectNotesTab({ projectId }: { projectId: string }) {
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const debounceRef = useRef<any>(null);
  const qc = useQueryClient();

  const note = useQuery({
    queryKey: ["project_note", projectId, noteDate],
    queryFn: () => projectNotesService.getByDate(projectId, noteDate),
  });

  useEffect(() => {
    if (note.data) setContent(note.data.content);
    else setContent("");
  }, [note.data, noteDate]);

  const autoSave = useCallback((text: string) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await projectNotesService.upsert(projectId, noteDate, text);
      } catch { /* silent */ }
      setSaving(false);
    }, 1500);
  }, [projectId, noteDate]);

  const handleChange = (text: string) => {
    setContent(text);
    autoSave(text);
  };

  const handleDictation = (text: string) => {
    const updated = content ? content + "\n" + text : text;
    setContent(updated);
    autoSave(updated);
  };

  const handleExtract = async () => {
    if (!content.trim()) return;
    setExtracting(true);
    setSuggestions([]);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("project-ai-extract-actions", {
        body: { content: content.slice(0, 3000), note_date: noteDate, project_id: projectId },
      });
      if (error) throw error;
      setSuggestions(data?.suggestions ?? []);
      setSelected(new Set((data?.suggestions ?? []).map((_: any, i: number) => i)));
    } catch (e: any) {
      toast.error(e.message || "Extraction failed");
    }
    setExtracting(false);
  };

  const handleApply = async () => {
    const toApply = suggestions.filter((_, i) => selected.has(i));
    let created = 0;
    for (const s of toApply) {
      try {
        if (s.type === "task") {
          await taskService.create({ title: s.title, due_date: s.due_at, priority: s.priority === "P1" ? "high" : s.priority === "P3" ? "low" : "medium", source: "notes", project_id: projectId } as any);
          created++;
        } else if (s.type === "reminder") {
          await reminderService.create({ title: s.title, reminder_time: s.remind_at || new Date().toISOString(), project_id: projectId } as any);
          created++;
        }
      } catch { /* skip */ }
    }
    if (created > 0) {
      toast.success(`${created} item(s) created`);
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["reminders"] });
    }
    setSuggestions([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Input type="date" value={noteDate} onChange={(e) => setNoteDate(e.target.value)} className="w-[160px] h-9 text-sm" />
        <div className="flex items-center gap-2">
          <DictationMic onAppend={handleDictation} />
          {saving && <span className="text-[10px] text-muted-foreground">Saving...</span>}
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleExtract} disabled={extracting || !content.trim()}>
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Extract Actions
          </Button>
        </div>
      </div>

      <Textarea
        placeholder="Write project notes for this day..."
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        rows={10}
        className="text-sm"
      />

      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Extracted Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s: any, i: number) => (
              <label key={i} className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  onChange={() => {
                    const next = new Set(selected);
                    next.has(i) ? next.delete(i) : next.add(i);
                    setSelected(next);
                  }}
                  className="mt-0.5 h-4 w-4"
                />
                <div>
                  <Badge variant="outline" className="text-[10px] mr-1">{s.type}</Badge>
                  <span className="text-sm">{s.title}</span>
                  {s.due_at && <span className="text-[10px] text-muted-foreground ml-1">Due: {s.due_at}</span>}
                </div>
              </label>
            ))}
            <Button size="sm" onClick={handleApply} disabled={selected.size === 0}>
              Apply {selected.size} Selected
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Links Tab ──
function ProjectLinksTab({ links, loading, onAdd, onRemove }: { links: ProjectLink[]; loading: boolean; onAdd: (label: string, url: string) => void; onRemove: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Links & Resources</h3>
        <Button size="sm" className="gap-1" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add Link</Button>
      </div>
      {adding && (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (label.trim() && url.trim()) { onAdd(label.trim(), url.trim()); setLabel(""); setUrl(""); setAdding(false); } }}>
          <Input placeholder="Label (e.g. GitHub Repo)" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus className="h-9 text-sm" />
          <Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} type="url" className="h-9 text-sm" />
          <div className="flex gap-2">
            <Button type="submit" size="sm">Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {loading ? <Skeleton className="h-24" /> : links.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No links yet. Add GitHub, Notion, or Drive links.</CardContent></Card>
      ) : (
        <div className="space-y-1.5">
          {links.map((link) => (
            <Card key={link.id}>
              <CardContent className="flex items-center justify-between p-3">
                <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline min-w-0">
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{link.label || link.url}</span>
                </a>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => onRemove(link.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
