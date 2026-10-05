import { useState } from "react";
import type { MarketPrice } from "@/services/investService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, ExternalLink, Info } from "lucide-react";

const fmt = (n: number, d = 2) => n.toLocaleString("en-ZA", { minimumFractionDigits: d, maximumFractionDigits: d });

export function ChangeBadge({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <Badge variant="secondary" className="text-xs">n/a</Badge>;
  return (
    <Badge variant={value > 0 ? "default" : value < 0 ? "destructive" : "secondary"} className="text-xs">
      {value > 0 ? "+" : ""}{fmt(value, 2)}%
    </Badge>
  );
}

const asOf = (iso: string) => new Date(iso).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function priceText(p: MarketPrice) {
  const d = p.asset_type === "fx" ? 4 : 2;
  if (p.symbol.endsWith("/ZAR")) return `R ${fmt(p.price, d)}`;
  if (p.asset_type !== "fx") return `$${fmt(p.price, d)}`;
  return fmt(p.price, d);
}

const CHECKLIST = [
  "Economic calendar checked",
  "No major event in the next few hours",
  "US jobs report (NFP) — not imminent",
  "US CPI inflation — not imminent",
  "FOMC / Fed decision — not imminent",
  "SARB rate decision — not imminent",
  "Earnings (if trading stocks) — not imminent",
];

export default function OverviewTab({ prices, loading }: { prices: MarketPrice[]; loading: boolean }) {
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const zar = prices.find((p) => p.symbol === "USD/ZAR");
  const zc = zar?.change_1d ?? null;
  const mood = zc === null ? "Unknown" : zc > 0.5 ? "Risk-Off" : zc < -0.5 ? "Risk-On" : "Neutral";

  if (loading) return <div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="space-y-4">
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Global Risk Mood</p>
          <p className="text-2xl font-bold mt-1">{mood}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {mood === "Unknown" ? "No real 1-day USD/ZAR change available yet, so no mood is shown." :
             mood === "Risk-On" ? "Rand strengthened against the dollar over the last day." :
             mood === "Risk-Off" ? "Rand weakened against the dollar over the last day." :
             "Rand roughly flat against the dollar over the last day."}
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        Currency prices update about once a day — use TradingView for live charts.
      </p>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {prices.map((p) => (
          <Card key={p.symbol}>
            <CardContent className="p-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-medium">{p.symbol}</p>
                <p className="text-lg font-bold">{priceText(p)}</p>
                <p className="text-[11px] text-muted-foreground">as of {asOf(p.asof)}</p>
              </div>
              <ChangeBadge value={p.change_1d} />
            </CardContent>
          </Card>
        ))}
        {prices.length === 0 && (
          <Card className="col-span-full"><CardContent className="p-6 text-center text-sm text-muted-foreground">No prices yet. Tap Refresh to load today's prices.</CardContent></Card>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> Check before you trade</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {CHECKLIST.map((item, i) => (
            <label key={i} className="flex items-center gap-3 min-h-[40px] text-sm cursor-pointer">
              <Checkbox checked={!!checked[i]} onCheckedChange={(v) => setChecked((c) => ({ ...c, [i]: !!v }))} />
              {item}
            </label>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            <Button asChild variant="outline" className="h-11">
              <a href="https://www.investing.com/economic-calendar/" target="_blank" rel="noopener noreferrer">Investing.com calendar <ExternalLink className="h-4 w-4" /></a>
            </Button>
            <Button asChild variant="outline" className="h-11">
              <a href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener noreferrer">Forex Factory calendar <ExternalLink className="h-4 w-4" /></a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
