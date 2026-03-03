import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addDays, subDays, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval, isWithinInterval, parseISO } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted",
  doing: "bg-primary/60",
  blocked: "bg-destructive/60",
  done: "bg-success/60",
};

interface Props {
  tasks: any[];
  onUpdateTask: (id: string, updates: any) => void;
  onClickTask: (task: any) => void;
}

export default function TasksTimelineView({ tasks, onUpdateTask, onClickTask }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Extend to 2 weeks for better visibility
  const extendedEnd = addDays(weekEnd, 7);
  const allDays = eachDayOfInterval({ start: weekStart, end: extendedEnd });

  const timelineTasks = useMemo(() => {
    return tasks
      .filter(t => t.due_date || t.start_date)
      .map(t => {
        const due = t.due_date ? parseISO(t.due_date) : null;
        const start = t.start_date ? parseISO(t.start_date) : due ? subDays(due, 3) : null;
        const end = due || (start ? addDays(start, 3) : null);
        return { ...t, _start: start, _end: end };
      })
      .filter(t => t._start && t._end)
      .sort((a, b) => (a._start?.getTime() || 0) - (b._start?.getTime() || 0));
  }, [tasks]);

  const noDateTasks = tasks.filter(t => !t.due_date && !t.start_date);

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setWeekStart(subDays(weekStart, 7))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">
          {format(weekStart, "MMM d")} — {format(extendedEnd, "MMM d, yyyy")}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="text-xs ml-auto" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          Today
        </Button>
      </div>

      {/* Timeline Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Day Headers */}
          <div className="grid gap-0" style={{ gridTemplateColumns: `140px repeat(${allDays.length}, 1fr)` }}>
            <div className="text-xs font-medium p-1 border-b">Task</div>
            {allDays.map(d => (
              <div key={d.toISOString()} className={`text-[10px] text-center p-1 border-b border-l ${format(d, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd") ? "bg-primary/10 font-bold" : ""}`}>
                <div>{format(d, "EEE")}</div>
                <div>{format(d, "d")}</div>
              </div>
            ))}
          </div>

          {/* Task Rows */}
          {timelineTasks.map(t => {
            const startIdx = Math.max(0, differenceInDays(t._start!, weekStart));
            const span = Math.max(1, differenceInDays(t._end!, t._start!) + 1);
            const endIdx = startIdx + span;

            return (
              <div
                key={t.id}
                className="grid gap-0 border-b hover:bg-muted/20 cursor-pointer"
                style={{ gridTemplateColumns: `140px repeat(${allDays.length}, 1fr)` }}
                onClick={() => onClickTask(t)}
              >
                <div className="text-xs p-1.5 truncate flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[t.status] || "bg-muted"}`} />
                  {t.title}
                </div>
                {allDays.map((d, i) => (
                  <div key={d.toISOString()} className={`border-l min-h-[28px] ${i >= startIdx && i < endIdx ? `${STATUS_COLORS[t.status] || "bg-muted"} rounded-sm` : ""}`} />
                ))}
              </div>
            );
          })}

          {timelineTasks.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No tasks with dates. Add start/due dates to see them here.
            </div>
          )}
        </div>
      </div>

      {/* No-date tasks */}
      {noDateTasks.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Tasks without dates ({noDateTasks.length})</p>
            <div className="flex flex-wrap gap-1">
              {noDateTasks.map(t => (
                <Badge key={t.id} variant="outline" className="text-xs cursor-pointer hover:bg-muted" onClick={() => onClickTask(t)}>
                  {t.title}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
