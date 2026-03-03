import { useQuery } from "@tanstack/react-query";
import { businessCaseService, financialModelService, fundingPackService } from "@/services/solutionService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Briefcase, CheckCircle2, Circle, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { taskService } from "@/services/taskService";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

interface CheckItem {
  label: string;
  done: boolean;
  taskTitle: string;
}

function computeFundableReadiness(bc: any, fm: any, fp: any): { score: number; items: CheckItem[] } {
  const items: CheckItem[] = [];

  // Business Case (30%)
  items.push({ label: "Problem defined", done: !!bc?.problem?.trim(), taskTitle: "Define problem statement" });
  items.push({ label: "Target customer identified", done: !!bc?.customer?.trim(), taskTitle: "Identify target customer" });
  items.push({ label: "Offer described", done: !!bc?.offer?.trim(), taskTitle: "Describe your offer/solution" });
  items.push({ label: "Business model defined", done: !!bc?.model?.trim(), taskTitle: "Define business model" });

  // Financial Model (40%)
  items.push({ label: "Startup costs entered", done: Array.isArray(fm?.startup_costs_json) && fm.startup_costs_json.length > 0, taskTitle: "Enter startup costs" });
  items.push({ label: "Monthly costs entered", done: Array.isArray(fm?.monthly_costs_json) && fm.monthly_costs_json.length > 0, taskTitle: "Enter monthly operating costs" });
  items.push({ label: "Pricing model set", done: Array.isArray(fm?.pricing_json) && fm.pricing_json.length > 0, taskTitle: "Set up pricing model" });
  items.push({ label: "Funding target set", done: (fm?.funding_target_amount ?? 0) > 0, taskTitle: "Set funding target amount" });

  // Funding Pack (30%)
  items.push({ label: "Ask amount defined", done: (fp?.ask_amount ?? 0) > 0, taskTitle: "Define funding ask amount" });
  items.push({ label: "Use of funds breakdown", done: Array.isArray(fp?.use_of_funds_json) && fp.use_of_funds_json.length > 0, taskTitle: "Create use-of-funds breakdown" });

  const completed = items.filter(i => i.done).length;
  const score = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;
  return { score, items };
}

export default function FundableReadinessCard({ projectId }: Props) {
  const qc = useQueryClient();

  const bc = useQuery({ queryKey: ["business_case", projectId], queryFn: () => businessCaseService.get(projectId) });
  const fm = useQuery({ queryKey: ["financial_model", projectId], queryFn: () => financialModelService.get(projectId) });
  const fp = useQuery({ queryKey: ["funding_pack", projectId], queryFn: () => fundingPackService.get(projectId) });

  const createTaskMut = useMutation({
    mutationFn: (title: string) => taskService.create({ title, project_id: projectId, priority: "medium", status: "todo" } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
    },
  });

  if (bc.isLoading || fm.isLoading || fp.isLoading) return null;

  const { score, items } = computeFundableReadiness(bc.data, fm.data, fp.data);
  const color = score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive";
  const nextActions = items.filter(i => !i.done).slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" /> Fundable Readiness
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{items.filter(i => i.done).length}/{items.length} complete</span>
          <span className={`text-lg font-bold ${color}`}>{score}%</span>
        </div>
        <Progress value={score} className="h-2" />

        {nextActions.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Next actions:</span>
            {nextActions.map((item, i) => (
              <button
                key={i}
                className="flex items-center gap-2 w-full text-left p-1.5 rounded hover:bg-muted/50 transition-colors text-xs group"
                onClick={() => createTaskMut.mutate(item.taskTitle)}
                disabled={createTaskMut.isPending}
              >
                <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="flex-1">{item.label}</span>
                <Plus className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
