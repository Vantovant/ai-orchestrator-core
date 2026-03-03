import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { projectService } from "@/services/projectService";
import { businessCaseService, financialModelService, fundingPackService } from "@/services/solutionService";
import { tenderService } from "@/services/tenderService";
import { taskService } from "@/services/taskService";
import { activityLogService } from "@/services/activityLogService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Gavel, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
}

type SolutionChoice = "funded_business" | "tender";

const FUNDED_TEMPLATE_TASKS = [
  { title: "Define problem statement & target customer", priority: "high", status: "todo" },
  { title: "Draft business model canvas", priority: "high", status: "todo" },
  { title: "Build financial model (startup costs + projections)", priority: "high", status: "todo" },
  { title: "Prepare pitch deck (10 slides)", priority: "medium", status: "todo" },
  { title: "Create 1-page executive summary", priority: "medium", status: "todo" },
  { title: "Complete use-of-funds breakdown", priority: "medium", status: "todo" },
  { title: "Identify 5 funding sources", priority: "medium", status: "todo" },
  { title: "Begin outreach to funders", priority: "low", status: "todo" },
];

const TENDER_TEMPLATE_TASKS = [
  { title: "Review tender document thoroughly", priority: "critical", status: "todo" },
  { title: "Extract mandatory requirements", priority: "high", status: "todo" },
  { title: "Gather compliance documents (BBBEE, Tax, CSD)", priority: "high", status: "todo" },
  { title: "Draft executive summary", priority: "medium", status: "todo" },
  { title: "Write methodology section", priority: "medium", status: "todo" },
  { title: "Prepare pricing / BOQ", priority: "high", status: "todo" },
  { title: "Internal review & quality check", priority: "medium", status: "todo" },
  { title: "Submit before closing date", priority: "critical", status: "todo" },
];

export default function UpgradeToSolutionModal({ open, onClose, projectId, projectName }: Props) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState<SolutionChoice | null>(null);
  const [applyTemplate, setApplyTemplate] = useState(true);

  const upgradeMut = useMutation({
    mutationFn: async () => {
      if (!choice) throw new Error("Select a solution type");

      // 1. Update solution_type
      await projectService.update(projectId, { solution_type: choice } as any);

      // 2. Create missing related records
      if (choice === "funded_business") {
        const [bc, fm, fp] = await Promise.all([
          businessCaseService.get(projectId),
          financialModelService.get(projectId),
          fundingPackService.get(projectId),
        ]);
        await Promise.all([
          !bc && businessCaseService.upsert(projectId, { problem: "", customer: "", offer: "", model: "", risks_json: [] }),
          !fm && financialModelService.upsert(projectId, {}),
          !fp && fundingPackService.upsert(projectId, {}),
        ]);
      } else {
        const existing = await tenderService.get(projectId);
        if (!existing) {
          await tenderService.upsert(projectId, { entity: "", ref_no: "", status: "draft" });
        }
      }

      // 3. Apply template tasks if selected
      if (applyTemplate) {
        const templates = choice === "funded_business" ? FUNDED_TEMPLATE_TASKS : TENDER_TEMPLATE_TASKS;
        for (let i = 0; i < templates.length; i++) {
          await taskService.create({
            title: templates[i].title,
            priority: templates[i].priority,
            status: templates[i].status,
            project_id: projectId,
            order_index: i + 1,
          } as any);
        }
      }

      // 4. Log activity
      await activityLogService.log(projectId, "solution_upgraded", { solution_type: choice, template_applied: applyTemplate });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["project_tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(`Upgraded to ${choice === "funded_business" ? "Funded Business" : "TenderOS"}`);
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upgrade to Solution</DialogTitle>
          <DialogDescription>
            Turn "{projectName}" into a structured, outcome-driven solution. Existing tasks will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Choice cards */}
          <div className="grid gap-2">
            <button
              onClick={() => setChoice("funded_business")}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${choice === "funded_business" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}
            >
              <Briefcase className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="text-sm font-semibold">Funded Business</span>
                <p className="text-xs text-muted-foreground mt-0.5">Business case, financial model, funding pack. Ideal for startups, grants, investor readiness.</p>
              </div>
            </button>
            <button
              onClick={() => setChoice("tender")}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-all hover:bg-muted/50 ${choice === "tender" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}
            >
              <Gavel className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <span className="text-sm font-semibold">TenderOS</span>
                <p className="text-xs text-muted-foreground mt-0.5">Tender management, compliance vault, bid readiness score. For SA government tenders.</p>
              </div>
            </button>
          </div>

          {/* Template option */}
          {choice && (
            <label className="flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50">
              <input
                type="checkbox"
                checked={applyTemplate}
                onChange={(e) => setApplyTemplate(e.target.checked)}
                className="h-4 w-4"
              />
              <div>
                <span className="text-sm font-medium">Apply starter template</span>
                <p className="text-xs text-muted-foreground">
                  Add {choice === "funded_business" ? "8" : "8"} template tasks to guide your process
                </p>
              </div>
            </label>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>Existing tasks and data will not be deleted.</span>
          </div>

          <Button
            onClick={() => upgradeMut.mutate()}
            disabled={!choice || upgradeMut.isPending}
            className="w-full gap-2"
          >
            {upgradeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {choice ? `Upgrade to ${choice === "funded_business" ? "Funded Business" : "TenderOS"}` : "Select a type"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
