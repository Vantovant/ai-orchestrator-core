import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taskService } from "@/services/taskService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Zap, Loader2, Plus, AlertTriangle, Target, Calendar, TrendingUp } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: string;
  projectName: string;
  solutionType: string;
}

interface MentorBrief {
  top3: { title: string; reason: string }[];
  blocker: { issue: string; resolution: string } | null;
  nextMilestone: { title: string; dueDate: string | null } | null;
  readinessDriver: string;
  aiStatus?: string;
}

export default function MentorBriefCard({ projectId, projectName, solutionType }: Props) {
  const qc = useQueryClient();
  const [brief, setBrief] = useState<MentorBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState(false);

  const runMentor = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("solution-mentor", {
        body: { project_id: projectId, solution_type: solutionType },
      });
      if (error) throw error;
      if (data?.error === "BYOK_REQUIRED") {
        toast.error("Connect your AI key in Settings to use the Mentor.");
        return;
      }
      setBrief(data as MentorBrief);
    } catch (e: any) {
      toast.error(e.message || "Mentor unavailable");
    } finally {
      setLoading(false);
    }
  };

  const createTopTasks = async () => {
    if (!brief?.top3?.length) return;
    setCreatingTasks(true);
    try {
      // Check existing tasks to avoid duplicates
      const existing = await supabase
        .from("tasks")
        .select("title")
        .eq("project_id", projectId)
        .is("deleted_at", null);
      const existingTitles = new Set((existing.data ?? []).map((t: any) => t.title.toLowerCase()));

      let created = 0;
      for (const action of brief.top3) {
        if (!existingTitles.has(action.title.toLowerCase())) {
          await taskService.create({
            title: action.title,
            description: action.reason,
            priority: "high",
            status: "todo",
            project_id: projectId,
          } as any);
          created++;
        }
      }

      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(created > 0 ? `${created} tasks created` : "All tasks already exist");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCreatingTasks(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" /> Daily Mentor Brief
          </CardTitle>
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={runMentor} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {brief ? "Refresh" : "Get Brief"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !brief ? (
          <div className="space-y-2"><Skeleton className="h-6" /><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
        ) : !brief ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Get AI-powered daily guidance to raise your {solutionType === "funded_business" ? "fundable" : "bid"} readiness.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Top 3 Actions */}
            {brief.top3?.length > 0 && (
              <div>
                <span className="text-xs font-medium flex items-center gap-1 mb-1">
                  <Target className="h-3 w-3 text-primary" /> Top 3 Actions
                </span>
                <div className="space-y-1">
                  {brief.top3.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-1.5 rounded bg-muted/30">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0 mt-0.5">{i + 1}</span>
                      <div>
                        <span className="font-medium">{a.title}</span>
                        {a.reason && <p className="text-muted-foreground">{a.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline" size="sm" className="gap-1 text-xs mt-2 w-full"
                  onClick={createTopTasks} disabled={creatingTasks}
                >
                  {creatingTasks ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Create these tasks
                </Button>
              </div>
            )}

            {/* Blocker */}
            {brief.blocker && (
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-2">
                <span className="text-xs font-medium flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Blocker
                </span>
                <p className="text-xs mt-0.5">{brief.blocker.issue}</p>
                <p className="text-xs text-muted-foreground mt-0.5">→ {brief.blocker.resolution}</p>
              </div>
            )}

            {/* Next Milestone */}
            {brief.nextMilestone && (
              <div className="flex items-center gap-2 text-xs">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{brief.nextMilestone.title}</span>
                {brief.nextMilestone.dueDate && (
                  <Badge variant="outline" className="text-[10px]">{brief.nextMilestone.dueDate}</Badge>
                )}
              </div>
            )}

            {/* Readiness Driver */}
            {brief.readinessDriver && (
              <div className="flex items-start gap-2 text-xs bg-primary/5 border border-primary/20 rounded-lg p-2">
                <TrendingUp className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                <span>{brief.readinessDriver}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
