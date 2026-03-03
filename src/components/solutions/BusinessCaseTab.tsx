import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { businessCaseService, type BusinessCase } from "@/services/solutionService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: string;
}

export default function BusinessCaseTab({ projectId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ problem: "", customer: "", offer: "", model: "" });
  const [risks, setRisks] = useState<string[]>([]);
  const [newRisk, setNewRisk] = useState("");

  const query = useQuery({
    queryKey: ["business_case", projectId],
    queryFn: () => businessCaseService.get(projectId),
  });

  const saveMut = useMutation({
    mutationFn: () => businessCaseService.upsert(projectId, {
      problem: form.problem,
      customer: form.customer,
      offer: form.offer,
      model: form.model,
      risks_json: risks,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["business_case", projectId] });
      setEditing(false);
      toast.success("Business case saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = () => {
    const bc = query.data;
    setForm({
      problem: bc?.problem || "",
      customer: bc?.customer || "",
      offer: bc?.offer || "",
      model: bc?.model || "",
    });
    setRisks(bc?.risks_json as string[] || []);
    setEditing(true);
  };

  if (query.isLoading) return <Skeleton className="h-48" />;

  const bc = query.data;
  const isEmpty = !bc || (!bc.problem && !bc.customer && !bc.offer && !bc.model);

  if (!editing && isEmpty) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-muted-foreground text-sm">No business case defined yet.</p>
          <Button onClick={startEdit}>Create Business Case</Button>
        </CardContent>
      </Card>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        {[
          { key: "problem", label: "Problem Statement", placeholder: "What problem does this solve?" },
          { key: "customer", label: "Target Customer", placeholder: "Who is the ideal customer?" },
          { key: "offer", label: "Offer / Solution", placeholder: "What are you offering?" },
          { key: "model", label: "Business Model", placeholder: "How will this make money?" },
        ].map(({ key, label, placeholder }) => (
          <Card key={key}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                value={(form as any)[key]}
                onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                rows={3}
              />
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Key Risks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {risks.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm flex-1">{r}</span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setRisks(risks.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            ))}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newRisk.trim()) { setRisks([...risks, newRisk.trim()]); setNewRisk(""); } }}>
              <Input value={newRisk} onChange={(e) => setNewRisk(e.target.value)} placeholder="Add risk..." className="h-8 text-sm" />
              <Button type="submit" size="sm" variant="outline"><Plus className="h-3.5 w-3.5" /></Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {[
        { label: "Problem", value: bc?.problem },
        { label: "Customer", value: bc?.customer },
        { label: "Offer", value: bc?.offer },
        { label: "Model", value: bc?.model },
      ].map(({ label, value }) => value && (
        <Card key={label}>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
          <CardContent><p className="text-sm whitespace-pre-wrap">{value}</p></CardContent>
        </Card>
      ))}
      {bc?.risks_json && (bc.risks_json as string[]).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Risks</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {(bc.risks_json as string[]).map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                {r}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <Button variant="outline" onClick={startEdit}>Edit Business Case</Button>
    </div>
  );
}
