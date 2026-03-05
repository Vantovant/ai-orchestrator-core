import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  projectService, projectNotesService, projectLinksService,
  type Project, type ProjectNote, type ProjectLink,
} from "@/services/projectService";
import { taskService, makeDedupe, type Task, type TaskInsert } from "@/services/taskService";
import { meetingService, type Meeting, type MeetingInsert } from "@/services/meetingService";
import { reminderService, type ReminderInsert } from "@/services/reminderService";
import { activityLogService } from "@/services/activityLogService";
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
import { useProjectNotesSync, type SaveStatus } from "@/hooks/useProjectNotesSync";
import AIPartnerTab from "@/components/projects/AIPartnerTab";
import TasksTableView from "@/components/projects/TasksTableView";
import TasksBoardView from "@/components/projects/TasksBoardView";
import TasksTimelineView from "@/components/projects/TasksTimelineView";
import AccomplishmentsSection from "@/components/projects/AccomplishmentsSection";
import BlockedModal from "@/components/projects/BlockedModal";
import ImportWizard from "@/components/projects/ImportWizard";
// Solution tabs
import BusinessCaseTab from "@/components/solutions/BusinessCaseTab";
import FinancialModelTab from "@/components/solutions/FinancialModelTab";
import FundingPackTab from "@/components/solutions/FundingPackTab";
import TenderBriefTab from "@/components/solutions/TenderBriefTab";
import TenderRequirementsTab from "@/components/solutions/TenderRequirementsTab";
import TenderComplianceTab from "@/components/solutions/TenderComplianceTab";
import TenderProposalTab from "@/components/solutions/TenderProposalTab";
import BidReadinessCard from "@/components/solutions/BidReadinessCard";
import FundableReadinessCard from "@/components/solutions/FundableReadinessCard";
import MentorBriefCard from "@/components/solutions/MentorBriefCard";
import UpgradeToSolutionModal from "@/components/solutions/UpgradeToSolutionModal";
import {
  ArrowLeft, CheckCircle2, CircleDot, PauseCircle, AlertTriangle,
  Plus, Link2, Trash2, ExternalLink, Target, Calendar, FileText,
  Clock, Save, Sparkles, FolderKanban, Loader2, BookOpen, Copy,
  ChevronLeft, ChevronRight, Brain, LayoutList, Kanban, GanttChart,
  Trophy, Upload, Shield, DollarSign, Banknote, Briefcase, Gavel,
  ClipboardCheck, FileEdit, Send,
} from "lucide-react";
import { format, addDays, subDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  projectId: string;
  onBack: () => void;
}

export default function ProjectDetailPage({ projectId, onBack }: Props) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [tasksView, setTasksView] = useState<"table" | "board" | "timeline">("table");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [editing, setEditing] = useState(false);
  const [blockedModalOpen, setBlockedModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

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
      activityLogService.log(projectId, "task_created", {});
      toast.success("Task created");
    },
  });

  const updateTaskMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => taskService.update(id, updates),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      if (vars.updates.status) {
        activityLogService.log(projectId, "task_status_changed", { taskId: vars.id, status: vars.updates.status });
      }
    },
  });

  const deleteTaskMut = useMutation({
    mutationFn: (id: string) => taskService.softDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  // Bulk import
  const importTasksMut = useMutation({
    mutationFn: async (tasks: any[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      for (let i = 0; i < tasks.length; i++) {
        await taskService.create({
          title: tasks[i].title,
          status: tasks[i].status,
          priority: tasks[i].priority,
          due_date: tasks[i].due_date,
          start_date: tasks[i].start_date,
          completed_at: tasks[i].completed_at,
          order_index: i + 1,
          project_id: projectId,
        } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      activityLogService.log(projectId, "tasks_imported", {});
      setImportOpen(false);
      toast.success("Tasks imported!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Blocked workflow
  const markBlockedMut = useMutation({
    mutationFn: async (data: { reason: string; blockedBy: string; unblockEta: string | null; notes: string }) => {
      await projectService.update(projectId, {
        health: "blocked",
        is_blocked: true,
        blocked_reason: data.reason,
        blocked_by: data.blockedBy,
        unblock_eta: data.unblockEta,
      } as any);
      // Auto-create unblock task
      await taskService.create({
        title: `Unblock: ${project.data?.name || "Project"}`,
        description: `Reason: ${data.reason}\n\nBlocked by: ${data.blockedBy}\n\n${data.notes}`,
        priority: "high",
        status: "todo",
        due_date: data.unblockEta,
        project_id: projectId,
      } as any);
      await activityLogService.log(projectId, "project_blocked", { reason: data.reason, blocked_by: data.blockedBy });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setBlockedModalOpen(false);
      toast.success("Project marked as blocked. Unblock task created.");
    },
  });

  const unblockMut = useMutation({
    mutationFn: async () => {
      await projectService.update(projectId, {
        health: "on_track",
        is_blocked: false,
        blocked_reason: null,
        blocked_by: null,
        unblock_eta: null,
      } as any);
      await activityLogService.log(projectId, "project_unblocked", {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project unblocked!");
    },
  });

  // Meeting mutations
  const createMeetingMut = useMutation({
    mutationFn: (m: MeetingInsert & { project_id?: string }) => meetingService.create(m),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_meetings", projectId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });

  const updateMeetingMut = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: any }) => meetingService.update(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_meetings", projectId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });

  const deleteMeetingMut = useMutation({
    mutationFn: (id: string) => meetingService.softDelete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_meetings", projectId] });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    },
  });

  // Link mutations
  const addLinkMut = useMutation({
    mutationFn: ({ label, url }: { label: string; url: string }) => projectLinksService.create(projectId, label, url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_links", projectId] }),
  });

  const removeLinkMut = useMutation({
    mutationFn: (id: string) => projectLinksService.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_links", projectId] }),
  });

  const startEdit = () => {
    if (!project.data) return;
    setEditName(project.data.name);
    setEditDesc(project.data.description || "");
    setEditStatus(project.data.status);
    setEditing(true);
  };

  const handleReorder = (taskId: string, newIndex: number) => {
    updateTaskMut.mutate({ id: taskId, updates: { order_index: newIndex } });
  };

  if (project.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  if (!project.data) return <div className="text-center py-12 text-muted-foreground">Project not found</div>;

  const p = project.data;
  const solutionType = (p as any).solution_type || "standard";
  const tasks = linkedTasks.data ?? [];
  const meetings = linkedMeetings.data ?? [];
  const doneTasks = tasks.filter((t: any) => t.status === "done").length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const healthConfig: Record<string, { color: string; label: string; icon: any }> = {
    on_track: { color: "text-success", label: "On Track", icon: CircleDot },
    at_risk: { color: "text-warning", label: "At Risk", icon: AlertTriangle },
    blocked: { color: "text-destructive", label: "Blocked", icon: Shield },
  };
  const hc = healthConfig[p.health] || healthConfig.on_track;
  const HealthIcon = hc.icon;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}><ArrowLeft className="h-5 w-5" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{p.name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="outline" className={`text-xs gap-1 ${hc.color}`}>
              <HealthIcon className="h-3 w-3" />
              {hc.label}
            </Badge>
            <Badge variant="secondary" className="text-xs capitalize">{p.status}</Badge>
            {solutionType !== "standard" && (
              <Badge variant="outline" className="text-xs capitalize gap-1">
                {solutionType === "funded_business" ? <Briefcase className="h-3 w-3" /> : <Gavel className="h-3 w-3" />}
                {solutionType === "funded_business" ? "Funded Business" : "TenderOS"}
              </Badge>
            )}
            {totalTasks > 0 && (
              <Badge variant="outline" className="text-xs">{doneTasks}/{totalTasks} complete</Badge>
            )}
          </div>
        </div>
        {solutionType === "standard" && (
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setUpgradeOpen(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Upgrade to Solution
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="w-full md:w-auto flex-wrap">
            <TabsTrigger value="overview" className="gap-1 text-xs sm:text-sm"><Target className="h-3.5 w-3.5 hidden sm:inline" /> Overview</TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1 text-xs sm:text-sm"><CheckCircle2 className="h-3.5 w-3.5 hidden sm:inline" /> Tasks</TabsTrigger>
            <TabsTrigger value="accomplishments" className="gap-1 text-xs sm:text-sm"><Trophy className="h-3.5 w-3.5 hidden sm:inline" /> Done</TabsTrigger>

            {/* Funded Business tabs */}
            {solutionType === "funded_business" && (
              <>
                <TabsTrigger value="business_case" className="gap-1 text-xs sm:text-sm"><Briefcase className="h-3.5 w-3.5 hidden sm:inline" /> Case</TabsTrigger>
                <TabsTrigger value="financial_model" className="gap-1 text-xs sm:text-sm"><DollarSign className="h-3.5 w-3.5 hidden sm:inline" /> Financials</TabsTrigger>
                <TabsTrigger value="funding_pack" className="gap-1 text-xs sm:text-sm"><Banknote className="h-3.5 w-3.5 hidden sm:inline" /> Funding</TabsTrigger>
              </>
            )}

            {/* TenderOS tabs */}
            {solutionType === "tender" && (
              <>
                <TabsTrigger value="tender_brief" className="gap-1 text-xs sm:text-sm"><Gavel className="h-3.5 w-3.5 hidden sm:inline" /> Brief</TabsTrigger>
                <TabsTrigger value="tender_compliance" className="gap-1 text-xs sm:text-sm"><Shield className="h-3.5 w-3.5 hidden sm:inline" /> Compliance</TabsTrigger>
                <TabsTrigger value="tender_requirements" className="gap-1 text-xs sm:text-sm"><ClipboardCheck className="h-3.5 w-3.5 hidden sm:inline" /> Reqs</TabsTrigger>
                <TabsTrigger value="tender_proposal" className="gap-1 text-xs sm:text-sm"><FileEdit className="h-3.5 w-3.5 hidden sm:inline" /> Proposal</TabsTrigger>
                <TabsTrigger value="financial_model" className="gap-1 text-xs sm:text-sm"><DollarSign className="h-3.5 w-3.5 hidden sm:inline" /> Pricing</TabsTrigger>
              </>
            )}

            <TabsTrigger value="meetings" className="gap-1 text-xs sm:text-sm"><Calendar className="h-3.5 w-3.5 hidden sm:inline" /> Meetings</TabsTrigger>
            <TabsTrigger value="notes" className="gap-1 text-xs sm:text-sm"><FileText className="h-3.5 w-3.5 hidden sm:inline" /> Notes</TabsTrigger>
            <TabsTrigger value="links" className="gap-1 text-xs sm:text-sm"><Link2 className="h-3.5 w-3.5 hidden sm:inline" /> Links</TabsTrigger>
            <TabsTrigger value="ai_partner" className="gap-1 text-xs sm:text-sm"><Brain className="h-3.5 w-3.5 hidden sm:inline" /> AI</TabsTrigger>
          </TabsList>
        </div>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          <div className="space-y-4">
            {p.description && (
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">{p.description}</p></CardContent></Card>
            )}

            {/* Readiness Cards */}
            {solutionType === "tender" && <BidReadinessCard projectId={projectId} />}
            {solutionType === "funded_business" && <FundableReadinessCard projectId={projectId} />}

            {/* Mentor Brief for solution types */}
            {solutionType !== "standard" && (
              <MentorBriefCard projectId={projectId} projectName={p.name} solutionType={solutionType} />
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Progress Card */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Progress</span>
                    <span className="text-sm font-bold text-primary">{progress}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  {totalTasks > 0 ? (
                    <p className="text-xs text-muted-foreground">{doneTasks} / {totalTasks} complete</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No tasks yet</p>
                  )}
                </CardContent>
              </Card>

              {/* Health Card */}
              <Card>
                <CardContent className="p-4 space-y-2">
                  <span className="text-sm font-medium">Health</span>
                  <div className="flex items-center gap-2">
                    <HealthIcon className={`h-5 w-5 ${hc.color}`} />
                    <span className="text-sm font-semibold">{hc.label}</span>
                  </div>
                  {p.health === "blocked" && p.blocked_reason && (
                    <div className="text-xs text-destructive bg-destructive/10 rounded p-2 space-y-1">
                      <p><strong>Reason:</strong> {p.blocked_reason}</p>
                      {p.blocked_by && <p><strong>Blocked by:</strong> {p.blocked_by}</p>}
                      {p.unblock_eta && <p><strong>ETA:</strong> {format(new Date(p.unblock_eta), "MMM d, yyyy")}</p>}
                    </div>
                  )}
                  {p.health === "blocked" ? (
                    <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => unblockMut.mutate()}>
                      Unblock Project
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs w-full gap-1" onClick={() => setBlockedModalOpen(true)}>
                      <AlertTriangle className="h-3 w-3" /> Mark Blocked
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Next Actions */}
            {tasks.filter((t: any) => t.status !== "done").length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Next Actions</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  {tasks.filter((t: any) => t.status !== "done").slice(0, 5).map((t: any) => (
                    <button key={t.id} className="flex items-center gap-2 w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm" onClick={() => setSelectedTask(t)}>
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{t.title}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{t.status}</Badge>
                      {t.due_date && <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(t.due_date), "MMM d")}</span>}
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            <AccomplishmentsSection projectId={projectId} limit={5} />

            {meetings.filter((m: any) => new Date(m.start_time) >= new Date()).length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Upcoming Meetings</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  {meetings.filter((m: any) => new Date(m.start_time) >= new Date()).slice(0, 3).map((m: any) => (
                    <button key={m.id} className="flex items-center gap-2 w-full text-left p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm" onClick={() => setSelectedMeeting(m)}>
                      <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="truncate">{m.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{format(new Date(m.start_time), "MMM d, h:mm a")}</span>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg border overflow-hidden">
                <Button variant={tasksView === "table" ? "default" : "ghost"} size="sm" className="gap-1 rounded-none text-xs" onClick={() => setTasksView("table")}>
                  <LayoutList className="h-3.5 w-3.5" /> Table
                </Button>
                <Button variant={tasksView === "board" ? "default" : "ghost"} size="sm" className="gap-1 rounded-none text-xs" onClick={() => setTasksView("board")}>
                  <Kanban className="h-3.5 w-3.5" /> Board
                </Button>
                <Button variant={tasksView === "timeline" ? "default" : "ghost"} size="sm" className="gap-1 rounded-none text-xs" onClick={() => setTasksView("timeline")}>
                  <GanttChart className="h-3.5 w-3.5" /> Timeline
                </Button>
              </div>
              <Button variant="outline" size="sm" className="gap-1 text-xs ml-auto" onClick={() => setImportOpen(true)}>
                <Upload className="h-3.5 w-3.5" /> Import Tasks
              </Button>
            </div>

            {linkedTasks.isLoading ? <Skeleton className="h-48" /> : (
              <>
                {tasksView === "table" && (
                  <TasksTableView
                    tasks={tasks}
                    onUpdateTask={(id, updates) => updateTaskMut.mutate({ id, updates })}
                    onCreateTask={(title) => createTaskMut.mutate({ title, project_id: projectId, order_index: tasks.length + 1 } as any)}
                    onClickTask={setSelectedTask}
                    onReorder={handleReorder}
                  />
                )}
                {tasksView === "board" && (
                  <TasksBoardView
                    tasks={tasks}
                    onUpdateTask={(id, updates) => updateTaskMut.mutate({ id, updates })}
                    onClickTask={setSelectedTask}
                  />
                )}
                {tasksView === "timeline" && (
                  <TasksTimelineView
                    tasks={tasks}
                    onUpdateTask={(id, updates) => updateTaskMut.mutate({ id, updates })}
                    onClickTask={setSelectedTask}
                  />
                )}
              </>
            )}
          </div>
        </TabsContent>

        {/* ACCOMPLISHMENTS */}
        <TabsContent value="accomplishments">
          <AccomplishmentsSection projectId={projectId} showAll />
        </TabsContent>

        {/* FUNDED BUSINESS TABS */}
        {solutionType === "funded_business" && (
          <>
            <TabsContent value="business_case"><BusinessCaseTab projectId={projectId} /></TabsContent>
            <TabsContent value="financial_model"><FinancialModelTab projectId={projectId} /></TabsContent>
            <TabsContent value="funding_pack"><FundingPackTab projectId={projectId} /></TabsContent>
          </>
        )}

        {/* TENDER TABS */}
        {solutionType === "tender" && (
          <>
            <TabsContent value="tender_brief"><TenderBriefTab projectId={projectId} /></TabsContent>
            <TabsContent value="tender_compliance"><TenderComplianceTab projectId={projectId} /></TabsContent>
            <TabsContent value="tender_requirements"><TenderRequirementsTab projectId={projectId} /></TabsContent>
            <TabsContent value="tender_proposal"><TenderProposalTab projectId={projectId} /></TabsContent>
            <TabsContent value="financial_model"><FinancialModelTab projectId={projectId} /></TabsContent>
          </>
        )}

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
          <ProjectNotesTab projectId={projectId} onApplied={() => setActiveTab("tasks")} />
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

        {/* AI PARTNER */}
        <TabsContent value="ai_partner">
          <AIPartnerTab projectId={projectId} projectName={p.name} />
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

      {/* Blocked Modal */}
      <BlockedModal
        open={blockedModalOpen}
        onClose={() => setBlockedModalOpen(false)}
        projectName={p.name}
        onSubmit={(data) => markBlockedMut.mutate(data)}
        isPending={markBlockedMut.isPending}
      />

      {/* Import Wizard */}
      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(tasks) => importTasksMut.mutate(tasks)}
        isPending={importTasksMut.isPending}
      />

      {/* Upgrade Modal */}
      <UpgradeToSolutionModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        projectId={projectId}
        projectName={p.name}
      />

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
function ProjectNotesTab({ projectId, onApplied }: { projectId: string; onApplied?: () => void }) {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const freeformRef = useRef<HTMLTextAreaElement>(null);
  const lastDictationRef = useRef<string | null>(null);
  const qc = useQueryClient();

  const { isLoading: noteLoading, noteId, content, setContent, dirty, saveStatus, lastSavedAt, save } = useProjectNotesSync(projectId, selectedDate);
  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");

  const handleDictationAppend = useCallback((text: string) => {
    lastDictationRef.current = text;
    setContent(prev => prev ? (prev.endsWith(" ") ? `${prev}${text}` : `${prev} ${text}`) : text);
  }, [setContent]);

  const handleDictationUndo = useCallback(() => {
    const last = lastDictationRef.current;
    if (!last) return;
    setContent(prev => prev.endsWith(last) ? prev.slice(0, -(last.length)).replace(/ $/, "") : prev);
    lastDictationRef.current = null;
  }, [setContent]);

  const handleCopy = () => {
    navigator.clipboard.writeText(`📓 Project Notes — ${format(new Date(selectedDate), "EEEE, MMM d yyyy")}\n\n${content}`);
    toast.success("Copied");
  };

  const handleExtract = async () => {
    if (!content.trim()) return;
    setExtracting(true);
    setSuggestions([]);
    try {
      const { data, error } = await supabase.functions.invoke("project-ai-extract-actions", {
        body: { content: content.slice(0, 3000), note_date: selectedDate, project_id: projectId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const items = data?.suggestions ?? [];
      setSuggestions(items.map((s: any) => ({ ...s, applyStatus: "idle" })));
      setSelected(new Set(items.map((_: any, i: number) => i)));
      toast.success(items.length > 0 ? `Extracted ${items.length} action(s)` : "No actionable items found");
    } catch (e: any) { toast.error(e.message || "Extraction failed"); }
    setExtracting(false);
  };

  const handleApply = async () => {
    let user: any;
    try {
      const { data: { user: u }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !u) { toast.error("Not authenticated – please sign in"); return; }
      user = u;
    } catch { toast.error("Auth check failed"); return; }

    const toApply = [...selected].filter(i => {
      const s = suggestions[i];
      return s && s.applyStatus !== "created" && s.applyStatus !== "merged";
    });
    if (toApply.length === 0) { toast.info("Nothing to apply"); return; }

    setApplying(true);
    // Mark queued
    setSuggestions(prev => prev.map((s, i) => toApply.includes(i) ? { ...s, applyStatus: "queued" } : s));

    const priorityMap: Record<string, string> = { P1: "high", P2: "medium", P3: "low" };
    let created = 0, merged = 0, failed = 0;

    const updatedSuggestions = [...suggestions];
    for (const idx of toApply) {
      const s = updatedSuggestions[idx];
      if (!s) continue;
      try {
        if (s.type === "task" || s.type === "meeting") {
          const dedupeKey = makeDedupe(user.id, projectId, noteId, s.title);
          const { data: existing, error: lookupErr } = await supabase
            .from("tasks")
            .select("id")
            .eq("user_id", user.id)
            .eq("dedupe_key", dedupeKey)
            .is("deleted_at", null)
            .maybeSingle();
          if (lookupErr) throw lookupErr;

          if (existing) {
            const { error: updateErr } = await supabase.from("tasks").update({
              description: s.description || null,
              priority: priorityMap[s.priority || "P2"] || "medium",
              due_date: s.due_at || null,
              source: "note_extract",
              last_touched_at: new Date().toISOString(),
            }).eq("id", existing.id);
            if (updateErr) throw updateErr;
            updatedSuggestions[idx] = { ...s, applyStatus: "merged" };
            merged++;
          } else {
            const { error: insertErr } = await supabase.from("tasks").insert({
              title: s.title,
              description: s.description || null,
              user_id: user.id,
              priority: priorityMap[s.priority || "P2"] || "medium",
              due_date: s.due_at || null,
              source: "note_extract",
              note_id: noteId,
              project_id: projectId,
              dedupe_key: dedupeKey,
              status: "todo",
              last_touched_at: new Date().toISOString(),
            });
            if (insertErr) throw insertErr;
            updatedSuggestions[idx] = { ...s, applyStatus: "created" };
            created++;
          }
        } else if (s.type === "reminder") {
          const { error: remErr } = await supabase.from("reminders").insert({
            title: s.title,
            user_id: user.id,
            reminder_time: s.remind_at || new Date().toISOString(),
            project_id: projectId,
          });
          if (remErr) throw remErr;
          updatedSuggestions[idx] = { ...s, applyStatus: "created" };
          created++;
        } else {
          const dedupeKey = makeDedupe(user.id, projectId, noteId, s.title);
          const { data: existing } = await supabase
            .from("tasks").select("id").eq("user_id", user.id).eq("dedupe_key", dedupeKey).is("deleted_at", null).maybeSingle();
          if (existing) {
            await supabase.from("tasks").update({ source: "note_extract", last_touched_at: new Date().toISOString() }).eq("id", existing.id);
            updatedSuggestions[idx] = { ...s, applyStatus: "merged" };
            merged++;
          } else {
            const { error: insertErr } = await supabase.from("tasks").insert({
              title: s.title,
              description: s.description || null,
              user_id: user.id,
              source: "note_extract",
              note_id: noteId,
              project_id: projectId,
              dedupe_key: dedupeKey,
              status: "todo",
              last_touched_at: new Date().toISOString(),
            });
            if (insertErr) throw insertErr;
            updatedSuggestions[idx] = { ...s, applyStatus: "created" };
            created++;
          }
        }
      } catch (e: any) {
        console.error("Apply action failed:", idx, s.title, e);
        updatedSuggestions[idx] = { ...s, applyStatus: "failed", failReason: e.message || "Insert failed" };
        failed++;
      }
    }

    setSuggestions(updatedSuggestions);
    setApplying(false);

    // Invalidate AND refetch project tasks so Tasks tab reflects immediately
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId], exact: false }),
      qc.invalidateQueries({ queryKey: ["tasks"], exact: false }),
      qc.invalidateQueries({ queryKey: ["reminders"], exact: false }),
    ]);
    // Force refetch – don't rely on invalidation alone
    await Promise.all([
      qc.refetchQueries({ queryKey: ["project_tasks", projectId], exact: false }),
      qc.refetchQueries({ queryKey: ["tasks"], exact: false }),
    ]);

    // Log activity
    try {
      await activityLogService.log(projectId, "notes_actions_applied", {
        created, merged, failed, date: selectedDate,
      });
    } catch { /* non-critical */ }

    // Always show receipt toast
    const parts: string[] = [];
    if (created > 0) parts.push(`${created} created`);
    if (merged > 0) parts.push(`${merged} merged`);
    if (failed > 0) parts.push(`${failed} failed`);
    const receipt = parts.join(", ") || "No changes";

    if (failed > 0 && created === 0 && merged === 0) {
      toast.error(`Apply failed: ${receipt}`);
    } else if (failed > 0) {
      toast.warning(`Applied: ${receipt}`);
    } else {
      toast.success(`Applied: ${receipt}`);
    }

    // Verification query: count open tasks for this project
    try {
      const { count: verifiedCount, error: countErr } = await supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .in("status", ["todo", "open"]);
      if (countErr) {
        console.warn("Verification query failed:", countErr);
      } else {
        toast.info(`Verified: project now has ${verifiedCount ?? 0} open tasks`);
        if (created > 0 && (verifiedCount ?? 0) === 0) {
          toast.warning("⚠️ Insert may be blocked by RLS/constraint – check logs");
          console.error("VERIFICATION MISMATCH: created=" + created + " but verifiedCount=" + verifiedCount);
        }
      }
    } catch (verifyErr) {
      console.warn("Verification query error:", verifyErr);
    }

    if ((created > 0 || merged > 0) && onApplied) {
      setTimeout(() => onApplied(), 300);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setSelectedDate(format(subDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <h2 className="text-lg font-semibold">{format(new Date(selectedDate), "EEEE, MMM d")}</h2>
            {isToday && <Badge variant="secondary" className="text-xs">Today</Badge>}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSelectedDate(format(addDays(new Date(selectedDate), 1), "yyyy-MM-dd"))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DictationMic onAppend={handleDictationAppend} onUndo={handleDictationUndo} compact />
          <Button variant="outline" size="sm" className="gap-1" onClick={handleCopy}><Copy className="h-3.5 w-3.5" /> Copy</Button>
          <Button size="sm" className="gap-1" onClick={() => save()} disabled={!dirty || saveStatus === "saving"}>
            <Save className="h-3.5 w-3.5" /> {saveStatus === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <ProjectSaveStatusBadge status={saveStatus} lastSavedAt={lastSavedAt} onRetry={() => save()} />
      </div>

      {noteLoading ? <Skeleton className="h-48" /> : (
        <>
          <Textarea ref={freeformRef} value={content} onChange={(e) => setContent(e.target.value)} rows={12}
            placeholder="Write your project notes…" className="mt-1 font-mono text-sm" />
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleExtract} disabled={extracting || !content.trim()}>
            {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Extract Actions
          </Button>
          {suggestions.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Extracted Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {suggestions.map((s: any, i: number) => {
                  const isDone = s.applyStatus === "created" || s.applyStatus === "merged";
                  const isFailed = s.applyStatus === "failed";
                  return (
                    <label key={i} className={`flex items-start gap-2 p-2 rounded cursor-pointer border ${
                      isFailed ? "bg-destructive/5 border-destructive/30" :
                      isDone ? "bg-primary/5 border-primary/30" :
                      s.applyStatus === "queued" ? "bg-muted/50 border-muted" :
                      "hover:bg-muted/50 border-transparent"
                    }`}>
                      {s.applyStatus === "queued" ? <Loader2 className="h-4 w-4 animate-spin mt-0.5" /> :
                       isDone ? <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" /> :
                       isFailed ? <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" /> :
                       <input type="checkbox" checked={selected.has(i)} onChange={() => { const n = new Set(selected); n.has(i) ? n.delete(i) : n.add(i); setSelected(n); }} className="mt-0.5 h-4 w-4" disabled={applying} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{s.type}</Badge>
                          {s.priority && <Badge variant={s.priority === "P1" ? "destructive" : "secondary"} className="text-[10px]">{s.priority}</Badge>}
                          <span className={`text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}>{s.title}</span>
                        </div>
                        {isDone && <span className="text-[10px] text-primary">{s.applyStatus === "created" ? "✓ Created" : "↻ Merged"}</span>}
                        {isFailed && <span className="text-[10px] text-destructive">✗ {s.failReason || "Failed"}</span>}
                      </div>
                    </label>
                  );
                })}
                {(() => {
                  const actionable = [...selected].filter(i => suggestions[i]?.applyStatus === "idle").length;
                  return actionable > 0 ? (
                    <Button size="sm" className="w-full gap-1" onClick={handleApply} disabled={applying}>
                      {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {applying ? "Applying…" : `Apply ${actionable} Selected`}
                    </Button>
                  ) : null;
                })()}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function ProjectSaveStatusBadge({ status, lastSavedAt, onRetry }: { status: SaveStatus; lastSavedAt: string | null; onRetry: () => void }) {
  switch (status) {
    case "saving": return <Badge variant="secondary" className="gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" />Saving…</Badge>;
    case "saved": return <Badge variant="secondary" className="gap-1 text-xs"><CheckCircle2 className="h-3 w-3 text-primary" />Saved {lastSavedAt && `at ${lastSavedAt}`}</Badge>;
    case "error": return <Badge variant="destructive" className="gap-1 text-xs cursor-pointer" onClick={onRetry}><AlertTriangle className="h-3 w-3" />Retry</Badge>;
    case "offline": return <Badge variant="outline" className="gap-1 text-xs">Offline — saved locally</Badge>;
    default: return null;
  }
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
          <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus className="h-9 text-sm" />
          <Input placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} type="url" className="h-9 text-sm" />
          <div className="flex gap-2">
            <Button type="submit" size="sm">Add</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {loading ? <Skeleton className="h-24" /> : links.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No links yet.</CardContent></Card>
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
