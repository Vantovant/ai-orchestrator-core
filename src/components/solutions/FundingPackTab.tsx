import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fundingPackService, type FundingPack } from "@/services/solutionService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Plus, Trash2, Loader2, Banknote } from "lucide-react";
import { toast } from "sonner";

interface FundItem { category: string; amount: number; notes: string }

interface Props {
  projectId: string;
}

export default function FundingPackTab({ projectId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [useOfFunds, setUseOfFunds] = useState<FundItem[]>([]);
  const [askAmount, setAskAmount] = useState<number | "">(0);
  const [deadline, setDeadline] = useState("");
  const [status, setStatus] = useState("draft");

  const query = useQuery({
    queryKey: ["funding_pack", projectId],
    queryFn: () => fundingPackService.get(projectId),
  });

  const saveMut = useMutation({
    mutationFn: () => fundingPackService.upsert(projectId, {
      use_of_funds_json: useOfFunds,
      ask_amount: askAmount === "" ? 0 : askAmount,
      deadline: deadline || null,
      status,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["funding_pack", projectId] });
      setEditing(false);
      toast.success("Funding pack saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = () => {
    const fp = query.data;
    setUseOfFunds((fp?.use_of_funds_json as FundItem[]) || []);
    setAskAmount(fp?.ask_amount ?? 0);
    setDeadline(fp?.deadline || "");
    setStatus(fp?.status || "draft");
    setEditing(true);
  };

  if (query.isLoading) return <Skeleton className="h-48" />;

  const fp = query.data;

  if (!editing && !fp) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <Banknote className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">No funding pack yet.</p>
          <Button onClick={startEdit}>Create Funding Pack</Button>
        </CardContent>
      </Card>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Ask Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Ask Amount (ZAR)</label>
              <Input type="number" value={askAmount} onChange={(e) => setAskAmount(e.target.value === "" ? "" : Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Deadline</label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="funded">Funded</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Use of Funds</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {useOfFunds.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>{item.category}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">R {item.amount.toLocaleString()}</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setUseOfFunds(useOfFunds.filter((_, j) => j !== i))}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
            <UseOfFundsForm onAdd={(item) => setUseOfFunds([...useOfFunds, item])} />
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

  const totalFunds = (fp?.use_of_funds_json as FundItem[] || []).reduce((s, c) => s + c.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Ask Amount</p>
            <p className="text-lg font-bold text-primary">R {(fp?.ask_amount || 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="mt-1 capitalize">{fp?.status}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total Allocated</p>
            <p className="text-lg font-bold">R {totalFunds.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {(fp?.use_of_funds_json as FundItem[] || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Use of Funds Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(fp?.use_of_funds_json as FundItem[]).map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>{item.category}</span>
                <span className="font-medium">R {item.amount.toLocaleString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Button variant="outline" onClick={startEdit}>Edit Funding Pack</Button>
    </div>
  );
}

function UseOfFundsForm({ onAdd }: { onAdd: (item: FundItem) => void }) {
  const [cat, setCat] = useState("");
  const [amt, setAmt] = useState<number | "">("");

  return (
    <form className="flex gap-2" onSubmit={(e) => {
      e.preventDefault();
      if (cat.trim() && amt !== "" && amt > 0) {
        onAdd({ category: cat.trim(), amount: Number(amt), notes: "" });
        setCat(""); setAmt("");
      }
    }}>
      <Input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Category..." className="h-8 text-sm flex-1" />
      <Input type="number" value={amt} onChange={(e) => setAmt(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Amount" className="h-8 text-sm w-24" />
      <Button type="submit" size="sm" variant="outline"><Plus className="h-3.5 w-3.5" /></Button>
    </form>
  );
}
