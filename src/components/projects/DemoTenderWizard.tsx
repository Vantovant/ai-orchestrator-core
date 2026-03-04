import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gavel, FileText, Shield, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { taskService } from "@/services/taskService";

const DEMO_TENDERS = [
  {
    id: "saws_scm",
    title: "SAWS — Supply Chain Management Policy Review",
    org: "South African Weather Service",
    badge: "Service Tender",
    description: "Review SCM policy, alignment to PFMA/NT regulations/internal controls, identify gaps, propose updated policy + implementation plan.",
    deliverables: [
      "Gap analysis report on current SCM policy",
      "Revised SCM policy document",
      "Standard Operating Procedures (SOPs)",
      "Compliance checklist (PFMA, NT regulations)",
      "Training plan for SCM staff",
      "Implementation roadmap with milestones",
    ],
    evaluation: [
      { criterion: "Relevant experience & track record", weight: 30 },
      { criterion: "Proposed methodology & approach", weight: 30 },
      { criterion: "Regulatory compliance knowledge", weight: 20 },
      { criterion: "Price", weight: 20 },
    ],
    complianceVault: [
      { label: "Tax Compliance Certificate (TCC)", type: "tax", required: true },
      { label: "CSD Registration", type: "registration", required: true },
      { label: "BBBEE Certificate / Affidavit", type: "bee", required: true },
      { label: "Company Registration Documents (CIPC)", type: "registration", required: true },
      { label: "Proof of Banking (Bank Confirmation Letter)", type: "banking", required: true },
      { label: "Key Personnel CVs", type: "personnel", required: true },
      { label: "References — Similar SCM Projects", type: "reference", required: true },
    ],
    tasks: [
      { title: "Register on CSD portal if not already registered", priority: "high" },
      { title: "Obtain valid Tax Compliance Certificate from SARS", priority: "high" },
      { title: "Prepare SCM gap analysis methodology document", priority: "medium" },
      { title: "Compile CVs of key personnel for submission", priority: "medium" },
      { title: "Draft pricing schedule for the engagement", priority: "medium" },
      { title: "Collate 3 reference letters from similar SCM projects", priority: "low" },
    ],
  },
  {
    id: "gta_redesign",
    title: "GTA — Organisational Redesign Project",
    org: "Gauteng Tourism Authority",
    badge: "Service Tender",
    description: "Organisational design assessment, operating model development, role clarity, structure options, and change management plan.",
    deliverables: [
      "As-is organisational analysis report",
      "Target Operating Model (TOM) document",
      "Structure proposals (2–3 options)",
      "Role profiles for all positions",
      "Change management plan",
      "Implementation timeline with resource requirements",
    ],
    evaluation: [
      { criterion: "Organisational design capability", weight: 30 },
      { criterion: "Approach & methodology", weight: 25 },
      { criterion: "Stakeholder management experience", weight: 25 },
      { criterion: "Price", weight: 20 },
    ],
    complianceVault: [
      { label: "Tax Compliance Certificate (TCC)", type: "tax", required: true },
      { label: "CSD Registration", type: "registration", required: true },
      { label: "BBBEE Certificate / Affidavit", type: "bee", required: true },
      { label: "Company Registration Documents (CIPC)", type: "registration", required: true },
      { label: "Proof of Banking (Bank Confirmation Letter)", type: "banking", required: true },
      { label: "Key Personnel CVs", type: "personnel", required: true },
      { label: "References — Similar OD Projects", type: "reference", required: true },
      { label: "Conflict of Interest Declaration", type: "declaration", required: true },
      { label: "POPIA / Data Handling Statement", type: "privacy", required: true },
    ],
    tasks: [
      { title: "Register on CSD portal if not already registered", priority: "high" },
      { title: "Obtain valid Tax Compliance Certificate from SARS", priority: "high" },
      { title: "Prepare organisational design methodology proposal", priority: "medium" },
      { title: "Draft stakeholder engagement plan", priority: "medium" },
      { title: "Compile CVs of OD specialists and change managers", priority: "medium" },
      { title: "Complete Conflict of Interest Declaration", priority: "high" },
      { title: "Draft POPIA data handling statement", priority: "medium" },
      { title: "Prepare pricing proposal with rate card", priority: "low" },
    ],
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (projectId: string) => void;
}

export default function DemoTenderWizard({ open, onOpenChange, onProjectCreated }: Props) {
  const [creating, setCreating] = useState<string | null>(null);

  const createDemoTender = async (template: typeof DEMO_TENDERS[0]) => {
    setCreating(template.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 1. Create project
      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id: user.id,
          name: template.title,
          description: template.description,
          status: "active",
          solution_type: "tender",
          health: "on_track",
        })
        .select()
        .single();
      if (projErr) throw projErr;

      // 2. Create tender brief (store as business case for now — maps to tender_brief tab)
      await supabase.from("business_cases").insert({
        user_id: user.id,
        project_id: project.id,
        problem: template.description,
        customer: template.org,
        offer: template.deliverables.join("\n• "),
        model: `Evaluation:\n${template.evaluation.map(e => `• ${e.criterion} (${e.weight}%)`).join("\n")}`,
        risks_json: template.evaluation.map(e => ({ criterion: e.criterion, weight: e.weight })),
      });

      // 3. Create compliance vault items as compliance_reminders
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 3);
      for (const item of template.complianceVault) {
        await supabase.from("compliance_reminders").insert({
          user_id: user.id,
          label: item.label,
          type: item.type,
          due_date: futureDate.toISOString().split("T")[0],
          is_done: false,
          notes: `Required for: ${template.title}`,
        });
      }

      // 4. Create starter tasks
      for (let i = 0; i < template.tasks.length; i++) {
        await taskService.create({
          title: template.tasks[i].title,
          priority: template.tasks[i].priority,
          status: "todo",
          project_id: project.id,
          order_index: i + 1,
        } as any);
      }

      toast.success(`Demo tender "${template.title}" created with compliance vault and ${template.tasks.length} tasks!`);
      onOpenChange(false);
      onProjectCreated(project.id);
    } catch (e: any) {
      toast.error(e.message || "Failed to create demo tender");
    } finally {
      setCreating(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-primary" />
            Demo Tender Wizard
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Start with a pre-built service tender to see TenderOS in action. Each demo creates a project, compliance vault, readiness score, and starter tasks.
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {DEMO_TENDERS.map((tender) => (
            <Card key={tender.id} className="border-2 hover:border-primary/50 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{tender.title}</CardTitle>
                    <CardDescription className="mt-1">{tender.org}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">{tender.badge}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{tender.description}</p>

                <div className="grid gap-2 sm:grid-cols-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span>{tender.deliverables.length} deliverables</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    <span>{tender.complianceVault.length} compliance items</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span>{tender.tasks.length} starter tasks</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1">
                  {tender.evaluation.map((e) => (
                    <Badge key={e.criterion} variant="outline" className="text-[10px]">
                      {e.criterion} ({e.weight}%)
                    </Badge>
                  ))}
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={() => createDemoTender(tender)}
                  disabled={creating !== null}
                >
                  {creating === tender.id ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Gavel className="h-4 w-4" />
                      Create This Demo Tender
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
