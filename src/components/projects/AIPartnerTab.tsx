import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { taskService } from "@/services/taskService";
import PartnerMemoryPanel from "@/components/projects/PartnerMemoryPanel";
import FundingPathwaysTab from "@/components/projects/FundingPathwaysTab";
import {
  Brain, Zap, Target, ShieldCheck, Loader2, CheckCircle2,
  AlertTriangle, ArrowRight, Calendar, Clock, Sparkles, Banknote,
} from "lucide-react";
import { toast } from "sonner";

type Mode = "executive_brief" | "sprint_plan" | "sell_readiness" | "funding_pathways";

interface AIPartnerTabProps {
  projectId: string;
  projectName: string;
}

const modeConfig: Record<Mode, { label: string; icon: any; description: string; color: string }> = {
  executive_brief: { label: "Executive Brief", icon: Brain, description: "Status, priorities, risks, prep", color: "text-primary" },
  sprint_plan: { label: "Sprint Plan", icon: Zap, description: "7-day action plan with daily items", color: "text-warning" },
  sell_readiness: { label: "Sell-Readiness", icon: ShieldCheck, description: "Scorecard & missing items audit", color: "text-success" },
  funding_pathways: { label: "Funding", icon: Banknote, description: "Funding types, readiness & sources", color: "text-primary" },
};

export default function AIPartnerTab({ projectId, projectName }: AIPartnerTabProps) {
  const qc = useQueryClient();
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const [result, setResult] = useState<any>(null);
  const [applying, setApplying] = useState(false);
  const [appliedTasks, setAppliedTasks] = useState<Set<number>>(new Set());

  const aiMut = useMutation({
    mutationFn: async (mode: Mode) => {
      const { data, error } = await supabase.functions.invoke("project-ai-partner", {
        body: { project_id: projectId, mode },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setAppliedTasks(new Set());
      qc.invalidateQueries({ queryKey: ["partner_scores_all"] });
    },
    onError: (e: any) => {
      toast.error(e.message || "AI Partner unavailable");
    },
  });

  const handleRun = (mode: Mode) => {
    if (mode === "funding_pathways") {
      setActiveMode(mode);
      setResult(null);
      return; // Funding has its own tab UI
    }
    setActiveMode(mode);
    setResult(null);
    aiMut.mutate(mode);
  };

  const handleApplyTask = async (task: any, index: number) => {
    setApplying(true);
    try {
      const dueDate = task.due_in_days
        ? new Date(Date.now() + task.due_in_days * 86400000).toISOString()
        : undefined;
      await taskService.create({
        title: task.title,
        priority: task.priority || "medium",
        due_date: dueDate,
        source: "ai_partner",
        project_id: projectId,
      } as any);
      setAppliedTasks(prev => new Set(prev).add(index));
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Task created: ${task.title}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to create task");
    }
    setApplying(false);
  };

  const r = result?.result;

  return (
    <div className="space-y-4">
      {/* Partner Memory */}
      <PartnerMemoryPanel projectId={projectId} projectName={projectName} />

      {/* Mode buttons */}
      <div className="grid gap-3 sm:grid-cols-4">
        {(Object.entries(modeConfig) as [Mode, typeof modeConfig[Mode]][]).map(([mode, cfg]) => {
          const Icon = cfg.icon;
          const isActive = activeMode === mode;
          const isLoading = aiMut.isPending && activeMode === mode;
          return (
            <Button
              key={mode}
              variant={isActive ? "default" : "outline"}
              className="h-auto py-3 px-4 flex flex-col items-start gap-1 text-left"
              onClick={() => handleRun(mode)}
              disabled={aiMut.isPending}
            >
              <div className="flex items-center gap-2 w-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className={`h-4 w-4 ${isActive ? "" : cfg.color}`} />}
                <span className="font-semibold text-sm">{cfg.label}</span>
              </div>
              <span className="text-[11px] opacity-70 font-normal">{cfg.description}</span>
            </Button>
          );
        })}
      </div>

      {/* Loading */}
      {aiMut.isPending && (
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">AI Senior Partner is analyzing {projectName}…</p>
          </CardContent>
        </Card>
      )}

      {/* Funding Pathways has its own UI */}
      {activeMode === "funding_pathways" && !aiMut.isPending && (
        <FundingPathwaysTab projectId={projectId} projectName={projectName} />
      )}

      {/* Results */}
      {r && activeMode === "executive_brief" && <ExecutiveBriefResult data={r} onApplyTask={handleApplyTask} appliedTasks={appliedTasks} applying={applying} />}
      {r && activeMode === "sprint_plan" && <SprintPlanResult data={r} onApplyTask={handleApplyTask} appliedTasks={appliedTasks} applying={applying} />}
      {r && activeMode === "sell_readiness" && <SellReadinessResult data={r} onApplyTask={handleApplyTask} appliedTasks={appliedTasks} applying={applying} />}

      {/* Metadata */}
      {result && activeMode !== "funding_pathways" && (
        <p className="text-[10px] text-muted-foreground text-right">
          Snapshot: {result.snapshot_len} chars {result.was_truncated && "(truncated)"} • AI status: {result.ai_status}
        </p>
      )}
    </div>
  );
}

// ── Executive Brief ──
function ExecutiveBriefResult({ data, onApplyTask, appliedTasks, applying }: any) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> Executive Brief</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">{data.status_summary}</p>
          {data.top_priorities?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">TOP PRIORITIES</h4>
              <div className="space-y-2">
                {data.top_priorities.map((p: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
                    <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{p.priority}</p>
                      <p className="text-xs text-muted-foreground">{p.reason}</p>
                      <p className="text-xs text-primary mt-0.5">→ {p.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.biggest_risk && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">BIGGEST RISK</h4>
              <div className="p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{data.biggest_risk.risk}</p>
                    <p className="text-xs text-muted-foreground">Impact: {data.biggest_risk.impact}</p>
                    <p className="text-xs text-success mt-0.5">Mitigation: {data.biggest_risk.mitigation}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {data.meeting_prep && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">MEETING PREP</h4>
              <p className="text-sm bg-muted/30 p-2 rounded-lg">{data.meeting_prep}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <SuggestedTasksList tasks={data.suggested_tasks} onApply={onApplyTask} applied={appliedTasks} applying={applying} />
    </div>
  );
}

// ── Sprint Plan ──
function SprintPlanResult({ data, onApplyTask, appliedTasks, applying }: any) {
  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Zap className="h-4 w-4 text-warning" /> 7-Day Sprint Plan</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {data.focus_areas?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">FOCUS AREAS</h4>
              <div className="flex flex-wrap gap-1.5">
                {data.focus_areas.map((f: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">{f}</Badge>
                ))}
              </div>
            </div>
          )}
          {data.daily_plan?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">DAILY ACTIONS</h4>
              <div className="space-y-2">
                {data.daily_plan.map((d: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-muted/30">
                    <p className="text-xs font-semibold text-primary mb-1">{d.day}</p>
                    <ul className="space-y-0.5">
                      {d.actions?.map((a: string, j: number) => (
                        <li key={j} className="text-xs flex items-start gap-1.5">
                          <ArrowRight className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.postpone?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">POSTPONE</h4>
              {data.postpone.map((p: any, i: number) => (
                <div key={i} className="text-xs p-2 rounded-lg bg-muted/30 mb-1">
                  <span className="font-medium">{p.item}</span> — <span className="text-muted-foreground">{p.reason}</span>
                </div>
              ))}
            </div>
          )}
          {data.quick_wins?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">QUICK WINS</h4>
              <ul className="space-y-1">
                {data.quick_wins.map((w: string, i: number) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <Sparkles className="h-3 w-3 text-warning shrink-0 mt-0.5" />{w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <SuggestedTasksList tasks={data.suggested_tasks} onApply={onApplyTask} applied={appliedTasks} applying={applying} />
    </div>
  );
}

// ── Sell Readiness ──
function SellReadinessResult({ data, onApplyTask, appliedTasks, applying }: any) {
  const dimensions = [
    { key: "problem_clarity", label: "Problem Clarity" },
    { key: "solution_maturity", label: "Solution Maturity" },
    { key: "mvp_stability", label: "MVP Stability" },
    { key: "onboarding_ux", label: "Onboarding & UX" },
    { key: "pricing_packaging", label: "Pricing & Packaging" },
    { key: "compliance", label: "Compliance" },
    { key: "support_docs", label: "Support & Docs" },
  ];
  const verdictColors: Record<string, string> = { ready: "text-success", almost_ready: "text-warning", not_ready: "text-destructive" };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" /> Sell-Readiness Audit</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-primary">{data.overall_score ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">/ 100</p>
            </div>
            <div className="flex-1">
              <Progress value={data.overall_score ?? 0} className="h-3" />
              <p className={`text-xs font-semibold mt-1 capitalize ${verdictColors[data.verdict] ?? ""}`}>
                {data.verdict?.replace(/_/g, " ")}
              </p>
            </div>
          </div>
          {data.summary && <p className="text-sm text-muted-foreground">{data.summary}</p>}
          {data.scores && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">SCORECARD</h4>
              <div className="space-y-2">
                {dimensions.map(({ key, label }) => {
                  const score = data.scores[key] ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span className="text-xs w-32 shrink-0">{label}</span>
                      <Progress value={score} className="h-2 flex-1" />
                      <span className="text-xs font-mono w-8 text-right">{score}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {data.missing_items?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">MISSING ITEMS</h4>
              <div className="space-y-1.5">
                {data.missing_items.map((m: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <Badge variant="outline" className="text-[10px] mb-0.5">{m.area}</Badge>
                        <p className="text-xs">{m.issue}</p>
                        <p className="text-[11px] text-primary mt-0.5">→ {m.next_step}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <SuggestedTasksList tasks={data.suggested_tasks} onApply={onApplyTask} applied={appliedTasks} applying={applying} />
    </div>
  );
}

// ── Suggested Tasks ──
function SuggestedTasksList({ tasks, onApply, applied, applying }: { tasks?: any[]; onApply: (t: any, i: number) => void; applied: Set<number>; applying: boolean }) {
  if (!tasks?.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Suggested Tasks</CardTitle></CardHeader>
      <CardContent className="space-y-1.5">
        <p className="text-[11px] text-muted-foreground mb-2">Click to add to your project. Each task requires confirmation.</p>
        {tasks.map((t: any, i: number) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
            <div className="flex-1 min-w-0">
              <p className="text-sm">{t.title}</p>
              <div className="flex gap-1 mt-0.5">
                <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                {t.due_in_days && <Badge variant="secondary" className="text-[10px]">{t.due_in_days}d</Badge>}
              </div>
            </div>
            {applied.has(i) ? (
              <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            ) : (
              <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" onClick={() => onApply(t, i)} disabled={applying}>
                {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />} Add
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
