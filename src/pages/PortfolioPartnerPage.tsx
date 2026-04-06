import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { projectService } from "@/services/projectService";
import { partnerScoresService } from "@/services/partnerScoresService";
import { taskService } from "@/services/taskService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, Zap, Target, Loader2, CheckCircle2,
  AlertTriangle, ArrowRight, Sparkles, BarChart3, TrendingUp,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import PortfolioPartnerChat from "@/components/portfolio/PortfolioPartnerChat";
import ScoresDashboard from "@/components/portfolio/ScoresDashboard";
import BriefingSettingsCard from "@/components/portfolio/BriefingSettingsCard";

type PortfolioMode = "portfolio_scan" | "focus_plan_week" | "compare_projects";

export default function PortfolioPartnerPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<PortfolioMode | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [applying, setApplying] = useState(false);
  const [appliedTasks, setAppliedTasks] = useState<Set<number>>(new Set());

  const projects = useQuery({ queryKey: ["projects"], queryFn: projectService.list });

  const activeProjects = (projects.data ?? []).filter(p => p.status !== "completed");

  const handleRun = async (m: PortfolioMode) => {
    setMode(m);
    setResult(null);
    setAppliedTasks(new Set());
    setLoading(true);
    try {
      const body: any = { mode: m };
      if (m === "compare_projects") {
        if (!compareA || !compareB) { toast.error("Select two projects to compare"); setLoading(false); return; }
        body.project_ids = [compareA, compareB];
      }
      const { data, error } = await supabase.functions.invoke("portfolio-ai-partner", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data?.result);
    } catch (e: any) {
      toast.error(e.message || "AI Partner unavailable");
    }
    setLoading(false);
  };

  const handleApplyTask = async (task: any, index: number) => {
    setApplying(true);
    try {
      const dueDate = task.due_in_days ? new Date(Date.now() + task.due_in_days * 86400000).toISOString() : undefined;
      await taskService.create({
        title: task.title,
        priority: task.priority || "medium",
        due_date: dueDate,
        source: "ai_partner",
        project_id: task.project_id || undefined,
      } as any);
      setAppliedTasks(prev => new Set(prev).add(index));
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Task created: ${task.title}`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setApplying(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" /> Portfolio Partner
        </h1>
        <p className="text-sm text-muted-foreground">Your AI co-founder — chat, analyze, strategize</p>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="chat" className="gap-1 text-xs">
            <MessageSquare className="h-3.5 w-3.5" /> Chat
          </TabsTrigger>
          <TabsTrigger value="analyze" className="gap-1 text-xs">
            <BarChart3 className="h-3.5 w-3.5" /> Analyze
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1 text-xs">
            <Zap className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
        </TabsList>

        {/* ═══ CHAT TAB ═══ */}
        <TabsContent value="chat" className="mt-4">
          <PortfolioPartnerChat projects={activeProjects.map(p => ({ id: p.id, name: p.name }))} />
        </TabsContent>

        {/* ═══ ANALYZE TAB ═══ */}
        <TabsContent value="analyze" className="mt-4 space-y-6">
          {/* Scores Dashboard with Trends */}
          {projects.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <ScoresDashboard projects={activeProjects as any} />
          )}

          {/* Action Buttons */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Button variant={mode === "focus_plan_week" ? "default" : "outline"} className="h-auto py-3 flex flex-col items-start gap-1 text-left" onClick={() => handleRun("focus_plan_week")} disabled={loading}>
              <div className="flex items-center gap-2"><Target className="h-4 w-4" /> <span className="font-semibold text-sm">This Week Focus</span></div>
              <span className="text-[11px] opacity-70 font-normal">Which project gets focus + why</span>
            </Button>
            <Button variant={mode === "portfolio_scan" ? "default" : "outline"} className="h-auto py-3 flex flex-col items-start gap-1 text-left" onClick={() => handleRun("portfolio_scan")} disabled={loading}>
              <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> <span className="font-semibold text-sm">Portfolio Scan</span></div>
              <span className="text-[11px] opacity-70 font-normal">Top risks, quick wins, what to stop</span>
            </Button>
            <div className="space-y-1.5">
              <div className="flex gap-1">
                <Select value={compareA} onValueChange={setCompareA}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Project A" /></SelectTrigger>
                  <SelectContent>{activeProjects.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={compareB} onValueChange={setCompareB}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Project B" /></SelectTrigger>
                  <SelectContent>{activeProjects.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button variant={mode === "compare_projects" ? "default" : "outline"} className="w-full h-8 text-xs gap-1" onClick={() => handleRun("compare_projects")} disabled={loading}>
                <TrendingUp className="h-3 w-3" /> Compare
              </Button>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <Card><CardContent className="p-6 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">AI Partner analyzing your portfolio…</p>
            </CardContent></Card>
          )}

          {/* Results */}
          {result && !loading && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> {mode === "focus_plan_week" ? "Weekly Focus Plan" : mode === "portfolio_scan" ? "Portfolio Scan" : "Project Comparison"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.summary && <p className="text-sm">{result.summary}</p>}

                {result.focus_project && (
                  <div className="p-2 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm font-medium">Focus: {result.focus_project}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{result.focus_reason}</p>
                  </div>
                )}

                {result.recommendations?.map((r: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-muted/30">
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.detail}</p>
                    {r.action && <p className="text-xs text-primary mt-0.5">→ {r.action}</p>}
                  </div>
                ))}

                {result.risks?.map((r: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-destructive/5 border border-destructive/10 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{r.project}: {r.risk}</p>
                      <p className="text-xs text-muted-foreground">{r.mitigation}</p>
                    </div>
                  </div>
                ))}

                {result.quick_wins?.map((w: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <Sparkles className="h-3 w-3 text-warning shrink-0 mt-0.5" />{w}
                  </div>
                ))}

                {result.comparison && (
                  <div className="space-y-2">
                    <p className="text-sm">{result.comparison.recommendation}</p>
                    <p className="text-xs text-muted-foreground">{result.comparison.reasoning}</p>
                  </div>
                )}

                {/* Suggested Tasks */}
                {result.suggested_tasks?.length > 0 && (
                  <div className="border-t pt-3">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">SUGGESTED TASKS</h4>
                    {result.suggested_tasks.map((t: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{t.title}</p>
                          <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                        </div>
                        {appliedTasks.has(i) ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleApplyTask(t, i)} disabled={applying}>
                            {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />} Add
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ SETTINGS TAB ═══ */}
        <TabsContent value="settings" className="mt-4 space-y-4">
          <BriefingSettingsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
