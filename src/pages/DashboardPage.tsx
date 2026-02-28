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
import { CheckSquare, Bell, Calendar, Zap, AlertCircle, Sparkles, Clock, Target, RefreshCw, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import ComplianceWidget from "@/components/compliance/ComplianceWidget";

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

// ── AI Status Banner ──
function AiStatusBanner({ aiStatus, message, onRetry, retrying }: { aiStatus: string; message: string; onRetry: () => void; retrying: boolean }) {
  if (aiStatus === "ok") return null;
  const isError = aiStatus === "error" || aiStatus === "rate_limited";
  return (
    <Card className={isError ? "border-destructive/50 bg-destructive/5" : "border-warning/50 bg-warning/5"}>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className={`h-5 w-5 ${isError ? "text-destructive" : "text-warning"}`} />
          <div>
            <p className="text-sm font-medium">{aiStatus === "rate_limited" ? "AI Rate Limited" : aiStatus === "degraded" ? "Standard Mode" : "AI Unavailable"}</p>
            <p className="text-xs text-muted-foreground">{message}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} /> Retry
        </Button>
      </CardContent>
    </Card>
  );
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
  const aiStatus = aiResult?.ai_status ?? (aiResult?.dailyPlan?.greeting ? "ok" : null);

  const runAssistant = async () => {
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("run-assistant");
      if (error) throw error;
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

  // ── DATA DRIFT FIX: Re-hydrate Top 5 from LIVE task data ──
  const priorityOrder = ["critical", "high", "medium", "low"];
  const liveTasks = tasks.data ?? [];
  const liveTaskMap = useMemo(() => {
    const map = new Map<string, (typeof liveTasks)[0]>();
    liveTasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [liveTasks]);

  const topPriorities = useMemo(() => {
    const aiPriorities = aiResult?.prioritizedTasks ?? [];

    if (aiPriorities.length > 0) {
      // Re-hydrate: keep AI ordering but filter out completed/deleted tasks using LIVE data
      const rehydrated = aiPriorities
        .map((aiTask: any) => {
          const live = liveTaskMap.get(aiTask.id);
          if (!live) return null; // deleted
          if (live.status === "done") return null; // completed after briefing
          if (live.deleted_at) return null; // soft-deleted
          return { ...aiTask, title: live.title, priority: aiTask.priority };
        })
        .filter(Boolean)
        .slice(0, 5);

      if (rehydrated.length > 0) return rehydrated;
    }

    // Fallback: standard priority sort
    return liveTasks
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
  }, [aiResult, liveTasks, liveTaskMap]);

  const isStandardMode = aiStatus && aiStatus !== "ok";

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

      {/* AI Status Banner */}
      {aiStatus && aiStatus !== "ok" && (
        <AiStatusBanner
          aiStatus={aiStatus}
          message={aiResult?.message ?? "AI is unavailable. Showing standard mode."}
          onRetry={runAssistant}
          retrying={aiLoading}
        />
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Active Tasks" value={liveTasks.filter((t) => t.status !== "done").length} icon={CheckSquare} loading={isLoading} />
        <StatCard title="Today's Meetings" value={todayMeetings.length} icon={Calendar} loading={isLoading} />
        <StatCard title="Urgent Reminders" value={urgentReminders.length} icon={Bell} loading={isLoading} />
        <StatCard title="Total Tasks" value={liveTasks.length} icon={CheckSquare} loading={isLoading} />
      </div>

      {/* AI-Generated Daily Agenda */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" /> AI Daily Agenda
            </CardTitle>
            {aiResult?.dailyPlan?.greeting && (
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => {
                const plan = aiResult.dailyPlan;
                const lines = [
                  `📋 DAILY BRIEFING`,
                  plan.greeting,
                  plan.dayOverview || "",
                  "",
                  plan.topPriorities?.length ? `🎯 Focus Areas:\n${plan.topPriorities.map((p: string) => `• ${p}`).join("\n")}` : "",
                  "",
                  plan.timeBlocks?.length ? `⏰ Time Blocks:\n${plan.timeBlocks.map((tb: any) => `${tb.time} [${tb.type}] ${tb.activity}`).join("\n")}` : "",
                  "",
                  aiResult.commands3?.length ? `⚡ 3 Commands for Today:\n${aiResult.commands3.map((c: string, i: number) => `${i+1}. ${c}`).join("\n")}` : "",
                ];
                navigator.clipboard.writeText(lines.filter(Boolean).join("\n"));
                toast.success("Briefing copied to clipboard");
              }}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            )}
          </div>
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
              {/* 3 Commands for Today */}
              {aiResult.commands3?.length > 0 && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <h4 className="mb-2 text-sm font-medium flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-primary" /> 3 Commands for Today</h4>
                  <ol className="list-decimal pl-5 text-sm space-y-1">
                    {aiResult.commands3.map((c: string, i: number) => <li key={i}>{c}</li>)}
                  </ol>
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
              {isStandardMode && <Badge variant="outline" className="text-xs ml-1">Standard mode</Badge>}
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

      {/* Compliance Widget */}
      <ComplianceWidget compact />

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
