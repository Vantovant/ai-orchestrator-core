import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { taskService, type TaskInsert } from "@/services/taskService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Info } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

const priorityColor: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-primary text-primary-foreground",
  low: "bg-muted text-muted-foreground",
};

type SortOption = "latest" | "due_date" | "priority";
type FilterOption = "all" | "pending" | "done" | "critical" | "high";

export default function TasksPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [sort, setSort] = useState<SortOption>("latest");
  const [filter, setFilter] = useState<FilterOption>("all");
  const tasks = useQuery({ queryKey: ["tasks", sort], queryFn: () => taskService.list(sort) });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");

  // Highlight support
  const highlightIds = searchParams.get("highlight")?.split(",") ?? [];
  const source = searchParams.get("source");
  const noteDate = searchParams.get("note_date");
  const projectId = searchParams.get("project_id");
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (highlightIds.length > 0) {
      const timer = setTimeout(() => setFading(true), 4000);
      return () => clearTimeout(timer);
    }
  }, [highlightIds.length]);

  const createMut = useMutation({
    mutationFn: (t: TaskInsert) => taskService.create(t),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); setOpen(false); setTitle(""); setDescription(""); toast.success("Task created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => taskService.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Task deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => taskService.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = (tasks.data ?? []).filter(t => {
    if (projectId && t.project_id !== projectId) return false;
    if (source && t.source !== source) return false;
    if (filter === "pending" && t.status === "done") return false;
    if (filter === "done" && t.status !== "done") return false;
    if (filter === "critical" && t.priority !== "critical") return false;
    if (filter === "high" && t.priority !== "high") return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Import banner */}
      {source === "note_extract" && noteDate && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span>Imported from Note: <strong>{noteDate}</strong></span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="latest">Latest</SelectItem>
              <SelectItem value="due_date">Due date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><Plus className="h-4 w-4" />Add Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Task</DialogTitle></DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => { e.preventDefault(); createMut.mutate({ title, priority, description: description || undefined }); }}
              >
                <Input placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} required />
                <Input placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="submit" className="w-full" disabled={createMut.isPending}>
                  {createMut.isPending ? "Creating..." : "Create Task"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {tasks.isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : tasks.error ? (
        <Card><CardContent className="p-6 text-center text-destructive">Error loading tasks</CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No tasks yet. Create your first task!</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const isHighlighted = highlightIds.includes(t.id) && !fading;
            return (
              <Card key={t.id} className={isHighlighted ? "ring-2 ring-primary animate-pulse" : ""}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={t.status === "done"}
                      onChange={() => updateStatusMut.mutate({ id: t.id, status: t.status === "done" ? "pending" : "done" })}
                      className="h-4 w-4 rounded border-border"
                    />
                    <div>
                      <span className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                      {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={priorityColor[t.priority] ?? ""}>{t.priority}</Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
