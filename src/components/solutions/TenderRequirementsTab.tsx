import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tenderService, tenderRequirementsService, type TenderRequirement } from "@/services/tenderService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

export default function TenderRequirementsTab({ projectId }: Props) {
  const qc = useQueryClient();
  const [newReq, setNewReq] = useState("");
  const [newMandatory, setNewMandatory] = useState(true);
  const [newSource, setNewSource] = useState("");

  const tender = useQuery({
    queryKey: ["tender", projectId],
    queryFn: () => tenderService.get(projectId),
  });

  const tenderId = tender.data?.id;

  const reqs = useQuery({
    queryKey: ["tender_requirements", tenderId],
    queryFn: () => tenderRequirementsService.list(tenderId!),
    enabled: !!tenderId,
  });

  const createMut = useMutation({
    mutationFn: () => tenderRequirementsService.create(tenderId!, newReq.trim(), newMandatory, newSource || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tender_requirements", tenderId] });
      setNewReq(""); setNewSource("");
      toast.success("Requirement added");
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      tenderRequirementsService.update(id, { status: status === "met" ? "pending" : "met" } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tender_requirements", tenderId] }),
  });

  if (tender.isLoading || reqs.isLoading) return <Skeleton className="h-48" />;

  if (!tenderId) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        Create a tender brief first to manage requirements.
      </CardContent></Card>
    );
  }

  const items = reqs.data || [];
  const mandatory = items.filter(r => r.mandatory);
  const optional = items.filter(r => !r.mandatory);
  const metCount = mandatory.filter(r => r.status === "met").length;

  return (
    <div className="space-y-4">
      {mandatory.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant={metCount === mandatory.length ? "default" : "outline"}>
            {metCount}/{mandatory.length} mandatory met
          </Badge>
        </div>
      )}

      {mandatory.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Mandatory</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {mandatory.map(r => (
              <RequirementRow key={r.id} req={r} onToggle={() => toggleMut.mutate({ id: r.id, status: r.status })} />
            ))}
          </CardContent>
        </Card>
      )}

      {optional.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Optional</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {optional.map(r => (
              <RequirementRow key={r.id} req={r} onToggle={() => toggleMut.mutate({ id: r.id, status: r.status })} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (newReq.trim()) createMut.mutate(); }}>
            <Input value={newReq} onChange={(e) => setNewReq(e.target.value)} placeholder="Add requirement..." className="h-8 text-sm" />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={newMandatory} onCheckedChange={(v) => setNewMandatory(!!v)} />
                Mandatory
              </label>
              <Input value={newSource} onChange={(e) => setNewSource(e.target.value)} placeholder="Source section (optional)" className="h-8 text-sm flex-1" />
              <Button type="submit" size="sm"><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function RequirementRow({ req, onToggle }: { req: TenderRequirement; onToggle: () => void }) {
  return (
    <button className="flex items-start gap-2 w-full text-left p-2 rounded hover:bg-muted/50 transition-colors" onClick={onToggle}>
      {req.status === "met" ? (
        <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <span className={`text-sm ${req.status === "met" ? "line-through text-muted-foreground" : ""}`}>{req.requirement}</span>
        {req.source_section && <span className="text-[10px] text-muted-foreground ml-2">[{req.source_section}]</span>}
      </div>
    </button>
  );
}
