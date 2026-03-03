import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";

const COLUMNS = [
  { key: "todo", label: "Todo", icon: Clock, color: "text-muted-foreground" },
  { key: "doing", label: "Doing", icon: Loader2, color: "text-primary" },
  { key: "blocked", label: "Blocked", icon: AlertTriangle, color: "text-destructive" },
  { key: "done", label: "Done", icon: CheckCircle2, color: "text-success" },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-l-destructive",
  medium: "border-l-warning",
  low: "border-l-muted-foreground",
};

interface Props {
  tasks: any[];
  onUpdateTask: (id: string, updates: any) => void;
  onClickTask: (task: any) => void;
}

export default function TasksBoardView({ tasks, onUpdateTask, onClickTask }: Props) {
  const grouped = useMemo(() => {
    const map: Record<string, any[]> = { todo: [], doing: [], blocked: [], done: [] };
    tasks.forEach(t => {
      const status = map[t.status] ? t.status : "todo";
      map[status].push(t);
    });
    // Sort each column by order_index
    Object.values(map).forEach(arr => arr.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
    return map;
  }, [tasks]);

  const handleMove = (taskId: string, currentStatus: string, newStatus: string) => {
    const updates: any = { status: newStatus };
    if (newStatus === "done" && currentStatus !== "done") updates.completed_at = new Date().toISOString();
    if (newStatus !== "done" && currentStatus === "done") updates.completed_at = null;
    onUpdateTask(taskId, updates);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {COLUMNS.map(col => {
        const Icon = col.icon;
        const colTasks = grouped[col.key] || [];
        return (
          <div key={col.key} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Icon className={`h-4 w-4 ${col.color}`} />
              <span className="text-sm font-semibold">{col.label}</span>
              <Badge variant="secondary" className="text-[10px] ml-auto">{colTasks.length}</Badge>
            </div>
            <div className="space-y-2 min-h-[100px] bg-muted/20 rounded-lg p-2">
              {colTasks.map(t => (
                <Card
                  key={t.id}
                  className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${PRIORITY_COLORS[t.priority] || "border-l-muted"}`}
                  onClick={() => onClickTask(t)}
                >
                  <CardContent className="p-3 space-y-2">
                    <p className={`text-sm font-medium ${t.status === "done" ? "line-through text-muted-foreground" : ""}`}>{t.title}</p>
                    {t.due_date && (
                      <span className="text-[10px] text-muted-foreground">Due: {format(new Date(t.due_date), "MMM d")}</span>
                    )}
                    {t.status === "blocked" && t.description && (
                      <Badge variant="destructive" className="text-[10px]">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Blocked
                      </Badge>
                    )}
                    <div className="flex gap-1 flex-wrap pt-1">
                      {COLUMNS.filter(c => c.key !== col.key).map(c => (
                        <Button
                          key={c.key}
                          variant="ghost"
                          size="sm"
                          className="h-5 text-[10px] px-1.5"
                          onClick={e => { e.stopPropagation(); handleMove(t.id, t.status, c.key); }}
                        >
                          → {c.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {colTasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No tasks</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
