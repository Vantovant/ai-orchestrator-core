import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taskService } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { meetingService } from "@/services/meetingService";
import { assistantRunService } from "@/services/assistantRunService";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckSquare, Bell, Calendar, Zap, AlertCircle, Sparkles, Clock, Target } from "lucide-react";
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

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getUserName(user: any): string {
  if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
  if (user?.user_metadata?.name) return user.user_metadata.name;
  if (user?.email) return user.email.split("@")[0];
  return "there";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: taskService.list });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: reminderService.list });
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingService.list });
  const latestRun = useQuery({ queryKey: ["assistant_run_latest"], queryFn: assistantRunService.getLatest });

  const [aiLoading, setAiLoading] = useState(false);

  const aiResult = latestRun.data?.result_json ?? null;

  const runAssistant = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-assistant");
      if (error) throw error;
      // Persist the run
      await assistantRunService.save(data.snapshot ?? {}, data);
      qc.invalidateQueries({ queryKey: ["assistant_run_latest"] });
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

  // Top 5 priorities: from AI if available, else from tasks sorted by priority
  const priorityOrder = ["critical", "high", "medium", "low"];
  const aiPriorities = aiResult?.prioritizedTasks?.slice(0, 5) ?? [];
  const fallbackPriorities = (tasks.data ?? [])
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      const pa = priorityOrder.indexOf(a.priority);
      const pb = priorityOrder.indexOf(b.priority);
      if (pa !== pb) return pa - pb;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    })
    .slice(0, 5);

  const topPriorities = aiPriorities.length > 0 ? aiPriorities : fallbackPriorities;

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {getGreeting()}, {getUserName(user)} ✨
          </h1>
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

      {/* AI-Generated Daily Agenda */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" /> AI Daily Agenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          {latestRun.isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-6" />)}</div>
          ) : !aiResult?.dailyPlan?.greeting ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground mb-3">Run AI Briefing to generate your personalized daily agenda.</p>
              <Button variant="outline" size="sm" onClick={runAssistant} disabled={aiLoading} className="gap-2">
                <Zap className="h-4 w-4" /> Generate Agenda
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="font-medium">{aiResult.dailyPlan.greeting}</p>
              {aiResult.dailyPlan.dayOverview && (
                <p className="text-sm text-muted-foreground">{aiResult.dailyPlan.dayOverview}</p>
              )}
              {aiResult.dailyPlan.topPriorities?.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">Focus Areas</h4>
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {aiResult.dailyPlan.topPriorities.map((p: string, i: number) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {aiResult.dailyPlan.timeBlocks?.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Time Blocks</h4>
                  <div className="space-y-1">
                    {aiResult.dailyPlan.timeBlocks.map((tb: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="font-mono text-xs text-muted-foreground w-16">{tb.time}</span>
                        <Badge variant="outline" className="text-xs">{tb.type}</Badge>
                        <span>{tb.activity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {aiResult.error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {aiResult.error}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Generated {latestRun.data?.created_at ? new Date(latestRun.data.created_at).toLocaleString() : ""}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top 5 Priorities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Top 5 Priorities
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tasks.isLoading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : topPriorities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks yet. Create your first task!</p>
            ) : (
              <div className="space-y-2">
                {topPriorities.map((t: any, idx: number) => (
                  <div key={t.id ?? idx} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{idx + 1}</span>
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{t.title}</span>
                        {t.reasoning && <p className="text-xs text-muted-foreground truncate">{t.reasoning}</p>}
                      </div>
                    </div>
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

      {/* Urgent Reminders */}
      {urgentReminders.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4 text-warning" /> Urgent Reminders</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {urgentReminders.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <span className="text-sm font-medium">{r.title}</span>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.reminder_time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
