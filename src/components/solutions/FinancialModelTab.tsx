import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { financialModelService, type FinancialModel } from "@/services/solutionService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Plus, Trash2, DollarSign, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CostItem { label: string; amount: number }

interface Props {
  projectId: string;
}

export default function FinancialModelTab({ projectId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [startupCosts, setStartupCosts] = useState<CostItem[]>([]);
  const [monthlyCosts, setMonthlyCosts] = useState<CostItem[]>([]);
  const [pricingItems, setPricingItems] = useState<CostItem[]>([]);
  const [runway, setRunway] = useState<number | "">(0);
  const [fundingTarget, setFundingTarget] = useState<number | "">(0);

  const query = useQuery({
    queryKey: ["financial_model", projectId],
    queryFn: () => financialModelService.get(projectId),
  });

  const saveMut = useMutation({
    mutationFn: () => financialModelService.upsert(projectId, {
      startup_costs_json: startupCosts,
      monthly_costs_json: monthlyCosts,
      pricing_json: pricingItems,
      runway_months: runway === "" ? null : runway,
      funding_target_amount: fundingTarget === "" ? 0 : fundingTarget,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["financial_model", projectId] });
      setEditing(false);
      toast.success("Financial model saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = () => {
    const fm = query.data;
    setStartupCosts((fm?.startup_costs_json as CostItem[]) || []);
    setMonthlyCosts((fm?.monthly_costs_json as CostItem[]) || []);
    setPricingItems((fm?.pricing_json as CostItem[]) || []);
    setRunway(fm?.runway_months ?? "");
    setFundingTarget(fm?.funding_target_amount ?? 0);
    setEditing(true);
  };

  if (query.isLoading) return <Skeleton className="h-48" />;

  const fm = query.data;
  const totalStartup = (fm?.startup_costs_json as CostItem[] || []).reduce((s, c) => s + (c.amount || 0), 0);
  const totalMonthly = (fm?.monthly_costs_json as CostItem[] || []).reduce((s, c) => s + (c.amount || 0), 0);
  const totalRevenue = (fm?.pricing_json as CostItem[] || []).reduce((s, c) => s + (c.amount || 0), 0);

  if (!editing && !fm) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">No financial model yet.</p>
          <Button onClick={startEdit}>Create Financial Model</Button>
        </CardContent>
      </Card>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <CostSection title="Startup Costs" items={startupCosts} setItems={setStartupCosts} />
        <CostSection title="Monthly Costs" items={monthlyCosts} setItems={setMonthlyCosts} />
        <CostSection title="Revenue / Pricing" items={pricingItems} setItems={setPricingItems} />

        <Card>
          <CardContent className="p-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Runway (months)</label>
              <Input type="number" value={runway} onChange={(e) => setRunway(e.target.value === "" ? "" : Number(e.target.value))} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Funding Target (ZAR)</label>
              <Input type="number" value={fundingTarget} onChange={(e) => setFundingTarget(e.target.value === "" ? "" : Number(e.target.value))} className="h-8 text-sm" />
            </div>
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
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Startup Costs" value={totalStartup} />
        <MetricCard label="Monthly Costs" value={totalMonthly} />
        <MetricCard label="Monthly Revenue" value={totalRevenue} positive />
      </div>

      {fm?.runway_months && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm">Runway</span>
            <Badge variant="outline" className="text-sm">{fm.runway_months} months</Badge>
          </CardContent>
        </Card>
      )}

      {fm?.funding_target_amount && fm.funding_target_amount > 0 && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm">Funding Target</span>
            <span className="text-sm font-bold text-primary">R {fm.funding_target_amount.toLocaleString()}</span>
          </CardContent>
        </Card>
      )}

      <Button variant="outline" onClick={startEdit}>Edit Financial Model</Button>
    </div>
  );
}

function MetricCard({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-lg font-bold ${positive ? "text-success" : ""}`}>R {value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}

function CostSection({ title, items, setItems }: { title: string; items: CostItem[]; setItems: (v: CostItem[]) => void }) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState<number | "">("");

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-sm">{item.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">R {item.amount.toLocaleString()}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ))}
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          if (label.trim() && amount !== "" && amount > 0) {
            setItems([...items, { label: label.trim(), amount: Number(amount) }]);
            setLabel(""); setAmount("");
          }
        }}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Item..." className="h-8 text-sm flex-1" />
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Amount" className="h-8 text-sm w-24" />
          <Button type="submit" size="sm" variant="outline"><Plus className="h-3.5 w-3.5" /></Button>
        </form>
        {items.length > 0 && (
          <div className="flex justify-end pt-1 border-t">
            <span className="text-xs text-muted-foreground">Total: R {items.reduce((s, c) => s + c.amount, 0).toLocaleString()}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
