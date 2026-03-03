import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tenderService, tenderProposalService, type TenderProposal } from "@/services/tenderService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

const SECTIONS = [
  { key: "exec_summary", label: "Executive Summary", placeholder: "Brief overview of your proposal..." },
  { key: "methodology", label: "Methodology", placeholder: "How you will deliver the work..." },
  { key: "team", label: "Team", placeholder: "Key team members and qualifications..." },
  { key: "experience", label: "Experience", placeholder: "Relevant past projects and references..." },
  { key: "qa_plan", label: "Quality Assurance", placeholder: "QA processes and standards..." },
  { key: "risk_mitigation", label: "Risk Mitigation", placeholder: "Risk identification and mitigation..." },
];

export default function TenderProposalTab({ projectId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const tender = useQuery({
    queryKey: ["tender", projectId],
    queryFn: () => tenderService.get(projectId),
  });

  const tenderId = tender.data?.id;

  const proposal = useQuery({
    queryKey: ["tender_proposal", tenderId],
    queryFn: () => tenderProposalService.get(tenderId!),
    enabled: !!tenderId,
  });

  const saveMut = useMutation({
    mutationFn: () => tenderProposalService.upsert(tenderId!, form as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tender_proposal", tenderId] });
      setEditing(false);
      toast.success("Proposal saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = () => {
    const p = proposal.data;
    const f: Record<string, string> = {};
    SECTIONS.forEach(s => { f[s.key] = (p as any)?.[s.key] || ""; });
    setForm(f);
    setEditing(true);
  };

  if (tender.isLoading || proposal.isLoading) return <Skeleton className="h-48" />;

  if (!tenderId) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        Create a tender brief first.
      </CardContent></Card>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        {SECTIONS.map(({ key, label, placeholder }) => (
          <Card key={key}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                value={form[key] || ""}
                onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                rows={4}
              />
            </CardContent>
          </Card>
        ))}
        <div className="flex gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  const p = proposal.data;
  const hasContent = SECTIONS.some(s => (p as any)?.[s.key]);

  if (!hasContent) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">No proposal content yet.</p>
          <Button onClick={startEdit}>Start Proposal</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {SECTIONS.map(({ key, label }) => {
        const val = (p as any)?.[key];
        if (!val) return null;
        return (
          <Card key={key}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{val}</p></CardContent>
          </Card>
        );
      })}
      <Button variant="outline" onClick={startEdit}>Edit Proposal</Button>
    </div>
  );
}
