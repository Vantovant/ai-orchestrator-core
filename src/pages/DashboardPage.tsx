import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taskService } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { meetingService } from "@/services/meetingService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckSquare, Bell, Calendar, Zap, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: number; icon: any; loading: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold">{value}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

const priorityColor: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-primary text-primary-foreground",
  low: "bg-muted text-muted-foreground",
};

export default function DashboardPage() {
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: taskService.list });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: reminderService.list });
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingService.list });
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const runAssistant = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-assistant");
      if (error) throw error;
      setAiResult(data);
      toast.success("AI briefing generated");
    } catch (err: any) {
      toast.error(err.message || "Failed to run assistant");
    } finally {
      setAiLoading(false);
    }
  };

  const now = new Date();
  const todayMeetings = (meetings.data ?? []).filter((m) => {
    const d = new Date(m.start_time);
    return d.toDateString() === now.toDateString();
  });
  const urgentReminders = (reminders.data ?? []).filter((r) => {
    const t = new Date(r.reminder_time);
    return !r.is_done && t.getTime() - now.getTime() < 48 * 60 * 60 * 1000;
  });

  const isLoading = tasks.isLoading || reminders.isLoading || meetings.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Executive Command Center</p>
        </div>
        <Button onClick={runAssistant} disabled={aiLoading} className="gap-2">
          <Zap className="h-4 w-4" />
          {aiLoading ? "Analyzing..." : "Run AI Briefing"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Tasks" value={tasks.data?.filter((t) => t.status !== "done").length ?? 0} icon={CheckSquare} loading={isLoading} />
        <StatCard title="Today's Meetings" value={todayMeetings.length} icon={Calendar} loading={isLoading} />
        <StatCard title="Urgent Reminders" value={urgentReminders.length} icon={Bell} loading={isLoading} />
        <StatCard title="Total Tasks" value={tasks.data?.length ?? 0} icon={CheckSquare} loading={isLoading} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Tasks */}
        <Card>
          <CardHeader><CardTitle className="text-base">Top Tasks</CardTitle></CardHeader>
          <CardContent>
            {tasks.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : tasks.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks yet</p>
            ) : (
              <div className="space-y-2">
                {tasks.data?.slice(0, 5).map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <span className="text-sm font-medium">{t.title}</span>
                    <Badge variant="secondary" className={priorityColor[t.priority] ?? ""}>{t.priority}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Meetings */}
        <Card>
          <CardHeader><CardTitle className="text-base">Today's Meetings</CardTitle></CardHeader>
          <CardContent>
            {meetings.isLoading ? (
              <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : todayMeetings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No meetings today</p>
            ) : (
              <div className="space-y-2">
                {todayMeetings.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <span className="text-sm font-medium">{m.title}</span>
                      <p className="text-xs text-muted-foreground">
                        {new Date(m.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {m.location ? ` · ${m.location}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Briefing Result */}
      {aiResult && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-accent" />AI Briefing</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {aiResult.error && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" /> {aiResult.error}
              </div>
            )}
            {aiResult.dailyPlan?.greeting && (
              <p className="font-medium">{aiResult.dailyPlan.greeting}</p>
            )}
            {aiResult.dailyPlan?.dayOverview && (
              <p className="text-sm text-muted-foreground">{aiResult.dailyPlan.dayOverview}</p>
            )}
            {aiResult.dailyPlan?.topPriorities?.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Top Priorities</h4>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {aiResult.dailyPlan.topPriorities.map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ul>
              </div>
            )}
            {aiResult.prioritizedTasks?.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-medium">Prioritized Tasks</h4>
                <div className="space-y-1">
                  {aiResult.prioritizedTasks.map((t: any) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary" className={priorityColor[t.priority] ?? ""}>{t.priority}</Badge>
                      <span>{t.title}</span>
                      <span className="text-xs text-muted-foreground">— {t.reasoning}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
