import { useState } from "react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { GripVertical, Plus, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  doing: "bg-primary/10 text-primary",
  blocked: "bg-destructive/10 text-destructive",
  done: "bg-success/10 text-success",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-warning/10 text-warning",
  high: "bg-destructive/10 text-destructive",
};

interface Props {
  tasks: any[];
  onUpdateTask: (id: string, updates: any) => void;
  onCreateTask: (title: string) => void;
  onClickTask: (task: any) => void;
  onReorder: (taskId: string, newIndex: number) => void;
}

export default function TasksTableView({ tasks, onUpdateTask, onCreateTask, onClickTask, onReorder }: Props) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [sortField, setSortField] = useState<string>("order_index");
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = [...tasks].sort((a, b) => {
    const av = a[sortField] ?? "";
    const bv = b[sortField] ?? "";
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(true); }
  };

  const handleStatusChange = (id: string, newStatus: string, oldStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "done" && oldStatus !== "done") updates.completed_at = new Date().toISOString();
    if (newStatus !== "done" && oldStatus === "done") updates.completed_at = null;
    onUpdateTask(id, updates);
  };

  const SortHeader = ({ field, children }: { field: string; children: React.ReactNode }) => (
    <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(field)}>
      {children}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{tasks.length} tasks</span>
        <Button size="sm" className="gap-1" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" /> Add Task
        </Button>
      </div>

      {adding && (
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (newTitle.trim()) { onCreateTask(newTitle.trim()); setNewTitle(""); setAdding(false); } }}>
          <Input placeholder="Task title..." value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus className="h-9 text-sm" />
          <Button type="submit" size="sm">Add</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
        </form>
      )}

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead><SortHeader field="title">Task</SortHeader></TableHead>
              <TableHead className="w-24"><SortHeader field="status">Status</SortHeader></TableHead>
              <TableHead className="w-24 hidden md:table-cell"><SortHeader field="start_date">Start</SortHeader></TableHead>
              <TableHead className="w-24"><SortHeader field="due_date">Due</SortHeader></TableHead>
              <TableHead className="w-28 hidden md:table-cell"><SortHeader field="completed_at">Completed</SortHeader></TableHead>
              <TableHead className="w-24"><SortHeader field="priority">Priority</SortHeader></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No tasks yet</TableCell></TableRow>
            ) : sorted.map((t, i) => (
              <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => onClickTask(t)}>
                <TableCell className="text-xs text-muted-foreground">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                </TableCell>
                <TableCell>
                  <span className={`text-sm ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</span>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Select value={t.status} onValueChange={v => handleStatusChange(t.id, v, t.status)}>
                    <SelectTrigger className="h-7 text-xs border-0 p-1">
                      <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[t.status] || ""}`}>{t.status}</Badge>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">Todo</SelectItem>
                      <SelectItem value="doing">Doing</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {t.start_date ? format(new Date(t.start_date), "MMM d") : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.due_date ? format(new Date(t.due_date), "MMM d") : "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                  {t.completed_at ? format(new Date(t.completed_at), "MMM d") : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] ${PRIORITY_COLORS[t.priority] || ""}`}>{t.priority}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
