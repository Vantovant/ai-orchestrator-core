import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { planService, DEFAULT_RISK_RULES, type TradingPlan } from "@/services/tradingService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";

const SECTIONS: { key: keyof TradingPlan; label: string; hint?: string }[] = [
  { key: "risk_rules", label: "Risk rules (non-negotiables)" },
  { key: "markets", label: "Markets I trade" },
  { key: "timeframes", label: "Timeframes", hint: "Higher TF for bias, lower TF for entry" },
  { key: "entry_rules", label: "Entry rules" },
  { key: "stop_rules", label: "Stop-loss rules" },
  { key: "target_rules", label: "Target rules" },
  { key: "no_trade_rules", label: "When NOT to trade" },
  { key: "daily_routine", label: "Daily routine" },
];

export default function PlanTab() {
  const plan = useQuery({ queryKey: ["trading_plan"], queryFn: planService.get });
  const versions = useQuery({ queryKey: ["trading_plan_versions", plan.data?.id], queryFn: () => planService.versions(plan.data!.id), enabled: !!plan.data?.id });
  const [v, setV] = useState<Partial<TradingPlan>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plan.isLoading) return;
    setV(plan.data ?? { risk_rules: DEFAULT_RISK_RULES });
  }, [plan.data, plan.isLoading]);

  const save = async () => {
    setSaving(true);
    try { await planService.save(plan.data ?? null, v); await plan.refetch(); await versions.refetch(); toast.success("Plan saved"); }
    catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {plan.data ? `Last updated ${new Date(plan.data.updated_at).toLocaleString("en-ZA")}` : "Not saved yet"}
      </p>
      {SECTIONS.map((s) => (
        <Card key={s.key}><CardContent className="p-4 space-y-2">
          <p className="font-medium text-sm">{s.label}</p>
          {s.hint && <p className="text-xs text-muted-foreground">{s.hint}</p>}
          <Textarea rows={s.key === "risk_rules" ? 6 : 3} value={(v[s.key] as string) ?? ""} onChange={(e) => setV({ ...v, [s.key]: e.target.value })} />
        </CardContent></Card>
      ))}
      <Button className="w-full h-12" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save plan"}</Button>

      {(versions.data ?? []).length > 0 && (
        <Card><CardContent className="p-4">
          <p className="font-medium text-sm mb-2">Previous versions (read-only)</p>
          <Accordion type="single" collapsible>
            {versions.data!.map((ver) => (
              <AccordionItem key={ver.id} value={ver.id}>
                <AccordionTrigger className="text-sm">Replaced {new Date(ver.created_at).toLocaleString("en-ZA")}</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  {SECTIONS.map((s) => (ver.snapshot as any)[s.key] ? (
                    <div key={s.key}><p className="text-xs font-medium">{s.label}</p><p className="text-xs text-muted-foreground whitespace-pre-wrap">{(ver.snapshot as any)[s.key]}</p></div>
                  ) : null)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent></Card>
      )}
    </div>
  );
}
