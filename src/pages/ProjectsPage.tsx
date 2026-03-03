import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { projectService, type Project, type ProjectInsert } from "@/services/projectService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FolderKanban, Plus, Search, Pin, MoreHorizontal,
  CheckCircle2, PauseCircle, CircleDot, AlertTriangle, ArrowRight, Brain,
  Briefcase, Gavel,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import ProjectDetailPage from "@/pages/ProjectDetailPage";

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  active: { icon: CircleDot, color: "text-success", label: "Active" },
  paused: { icon: PauseCircle, color: "text-warning", label: "Paused" },
  completed: { icon: CheckCircle2, color: "text-muted-foreground", label: "Completed" },
};

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [solutionFilter, setSolutionFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [solutionType, setSolutionType] = useState("standard");

  const projects = useQuery({ queryKey: ["projects"], queryFn: projectService.list });

  const createMut = useMutation({
    mutationFn: (p: ProjectInsert) => projectService.create(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setAddOpen(false);
      setName("");
      setDescription("");
      toast.success("Project created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePinMut = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => projectService.update(id, { is_pinned: pinned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  const filtered = useMemo(() => {
    let list = projects.data ?? [];
    if (filter !== "all") list = list.filter((p) => p.status === filter);
    if (solutionFilter !== "all") list = list.filter((p) => (p as any).solution_type === solutionFilter);
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [projects.data, filter, solutionFilter, search]);

  // If a project is selected, show detail view
  if (selectedProjectId) {
    return (
      <ProjectDetailPage
        projectId={selectedProjectId}
        onBack={() => setSelectedProjectId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FolderKanban className="h-6 w-6 text-primary" /> Projects
          </h1>
          <p className="text-sm text-muted-foreground">Personal project command center</p>
        </div>
        <Button className="gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 max-w-[240px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={solutionFilter} onValueChange={setSolutionFilter}>
          <SelectTrigger className="w-[160px] h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="funded_business">Funded Business</SelectItem>
            <SelectItem value="tender">TenderOS</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Project Cards */}
      {projects.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {search || filter !== "all" ? "No projects match your filters." : "No projects yet. Create your first one!"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => setSelectedProjectId(project.id)}
              onTogglePin={() => togglePinMut.mutate({ id: project.id, pinned: !project.is_pinned })}
            />
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate({ name, description, status, solution_type: solutionType } as any);
            }}
          >
            <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Solution Type</label>
              <Select value={solutionType} onValueChange={setSolutionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard Project</SelectItem>
                  <SelectItem value="funded_business">Funded Business Solution</SelectItem>
                  <SelectItem value="tender">TenderOS (Government Tender)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={createMut.isPending}>
              {createMut.isPending ? "Creating..." : "Create Project"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({ project, onClick, onTogglePin }: { project: Project; onClick: () => void; onTogglePin: () => void }) {
  const sc = statusConfig[project.status] ?? statusConfig.active;
  const StatusIcon = sc.icon;
  const healthConfig: Record<string, { color: string; label: string }> = {
    on_track: { color: "text-success", label: "On Track" },
    at_risk: { color: "text-warning", label: "At Risk" },
    blocked: { color: "text-destructive", label: "Blocked" },
  };
  const hc = healthConfig[project.health] || healthConfig.on_track;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-all active:scale-[0.99] relative group"
      onClick={onClick}
    >
      {project.is_pinned && (
        <Pin className="absolute top-3 right-3 h-3.5 w-3.5 text-primary fill-primary" />
      )}
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{project.description}</p>
            )}
          </div>
          <Badge
            variant="outline"
            className={`shrink-0 text-[10px] gap-1 ${sc.color}`}
          >
            <StatusIcon className="h-3 w-3" />
            {sc.label}
          </Badge>
        </div>

        {/* Progress */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Progress</span>
            <span>{project.progress_manual}%</span>
          </div>
          <Progress value={project.progress_manual} className="h-1.5" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {project.health === "blocked" && (
            <Badge variant="destructive" className="text-[10px] gap-1">
              <AlertTriangle className="h-3 w-3" /> Blocked
            </Badge>
          )}
          {project.health === "at_risk" && (
            <Badge variant="outline" className="text-[10px] gap-1 text-warning border-warning">
              <AlertTriangle className="h-3 w-3" /> At Risk
            </Badge>
          )}
          <Badge variant="outline" className={`text-[10px] gap-1 ${hc.color}`}>{hc.label}</Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            Updated {format(new Date(project.updated_at), "MMM d")}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          >
            <Pin className={`h-3 w-3 ${project.is_pinned ? "text-primary fill-primary" : "text-muted-foreground"}`} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
