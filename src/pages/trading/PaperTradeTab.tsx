import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ruleTradeService, settingsService, calcTicket, validateTicket, rMultiple, tradeStats, tradesToCsv,
  defaultTvSymbol, tvChartUrl, type RuleTrade, type TradingSettings,
} from "@/services/tradingService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Download, ExternalLink, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";

const n = (v: number | null | undefined, d = 2) => v === null || v === undefined ? "—" : Number(v).toLocaleString("en-ZA", { maximumFractionDigits: d });
const R = (v: number) => `R ${v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EMPTY = { symbol: "", tv: "", direction: "long" as "long" | "short", entry: "", stop: "", target: "", timeframe: "", setup: "", reason: "", calendar: false };

export default function PaperTradeTab({ trades, settings, refresh }: { trades: RuleTrade[]; settings: TradingSettings; refresh: () => void }) {
  const [f, setF] = useState(EMPTY);
  const [riskInput, setRiskInput] = useState(String(settings.risk_percent));
  const [closing, setClosing] = useState<RuleTrade | null>(null);
  const [editingStop, setEditingStop] = useState<RuleTrade | null>(null);

  const balance = Number(settings.paper_account_balance_zar);
  const risk = parseFloat(riskInput) || 0;
  const entry = parseFloat(f.entry), stop = parseFloat(f.stop), target = parseFloat(f.target);
  const calc = calcTicket(balance, risk, entry || 0, stop || 0, target || 0);
  const err = f.entry && f.stop && f.target ? validateTicket(f.direction, entry, stop, target) : null;
  const riskBlocked = settings.learning_mode && risk > 1;
  const stats = useMemo(() => tradeStats(trades), [trades]);
  const unlocked = stats.count >= 30 && settings.mentor_reviewed;

  const missing = !f.symbol || !f.tv || !f.entry || !f.stop || !f.target || !f.timeframe || !f.setup || !f.reason.trim() || !f.calendar;

  const save = useMutation({
    mutationFn: () => ruleTradeService.create({
      symbol: f.symbol.toUpperCase(), tradingview_symbol: f.tv.toUpperCase(), direction: f.direction,
      entry_price: entry, stop_loss: stop, target_price: target, timeframe: f.timeframe, setup_name: f.setup,
      reason: f.reason, calendar_checked: f.calendar, risk_percent: risk, risk_amount_zar: calc.riskAmount,
      position_size: calc.size, asset_type: f.symbol.includes("BTC") || f.symbol.includes("ETH") ? "crypto" : "fx",
    }),
    onSuccess: () => { toast.success("Paper trade logged"); setF(EMPTY); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const submit = () => {
    if (missing) return toast.error("Fill in every field and tick the calendar check.");
    if (err) return toast.error(err);
    if (riskBlocked) return toast.error("Risk above 1% is blocked in learning mode.");
    save.mutate();
  };

  const exportCsv = () => {
    const blob = new Blob([tradesToCsv(trades)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `paper-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium">Paper balance: {R(balance)}</p>
            {unlocked
              ? <Badge className="gap-1"><Unlock className="h-3 w-3" /> Live trading unlocked</Badge>
              : <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Live trading unlocks after 30 reviewed paper trades</Badge>}
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{Math.min(stats.count, 30)} / 30 paper trades toward live trading</p>
            <Progress value={Math.min(100, (stats.count / 30) * 100)} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Closed trades" value={String(stats.count)} />
            <Stat label="Win rate" value={`${n(stats.winRate, 0)}%`} />
            <Stat label="Total R" value={n(stats.totalR)} />
            <Stat label="Average R" value={n(stats.avgR)} />
            <Stat label="Avg win / loss (R)" value={`${n(stats.avgWin)} / ${n(stats.avgLoss)}`} />
            <Stat label="Rules followed" value={`${n(stats.rulesPct, 0)}%`} />
            <Stat label="Longest losing streak" value={String(stats.maxLosingStreak)} />
          </div>
          <label className="flex items-center gap-2 text-sm min-h-[40px]">
            <Checkbox checked={settings.mentor_reviewed} disabled={stats.count < 30}
              onCheckedChange={async (v) => { await settingsService.update({ mentor_reviewed: !!v }); refresh(); }} />
            Reviewed with my mentor {stats.count < 30 && <span className="text-xs text-muted-foreground">(after 30 trades)</span>}
          </label>
        </CardContent>
      </Card>

      {/* Ticket */}
      <Card>
        <CardHeader><CardTitle className="text-base">New paper trade</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Symbol"><Input className="h-11" placeholder="BTC/USD" value={f.symbol}
              onChange={(e) => { const s = e.target.value; setF({ ...f, symbol: s, tv: defaultTvSymbol(s) }); }} /></Field>
            <Field label="TradingView symbol"><Input className="h-11" placeholder="BITSTAMP:BTCUSD" value={f.tv} onChange={(e) => setF({ ...f, tv: e.target.value })} /></Field>
            <Field label="Direction">
              <Select value={f.direction} onValueChange={(v: any) => setF({ ...f, direction: v })}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="long">Long</SelectItem><SelectItem value="short">Short</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Timeframe"><Input className="h-11" placeholder="4H" value={f.timeframe} onChange={(e) => setF({ ...f, timeframe: e.target.value })} /></Field>
            <Field label="Entry"><Input className="h-11" type="number" step="any" inputMode="decimal" value={f.entry} onChange={(e) => setF({ ...f, entry: e.target.value })} /></Field>
            <Field label="Stop loss"><Input className="h-11" type="number" step="any" inputMode="decimal" value={f.stop} onChange={(e) => setF({ ...f, stop: e.target.value })} /></Field>
            <Field label="Target"><Input className="h-11" type="number" step="any" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
            <Field label="Risk % (max 1 learning)"><Input className="h-11" type="number" step="0.1" min="0.1" value={riskInput} onChange={(e) => setRiskInput(e.target.value)} /></Field>
          </div>
          <Field label="Setup name"><Input className="h-11" placeholder="e.g. Break & retest" value={f.setup} onChange={(e) => setF({ ...f, setup: e.target.value })} /></Field>
          <Field label="Reason — which rule of my plan this follows"><Textarea rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>

          <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 text-sm">
            <span className="text-muted-foreground">Risk amount</span><span className="font-medium text-right">{R(calc.riskAmount)}</span>
            <span className="text-muted-foreground">Position size</span><span className="font-medium text-right">{n(calc.size, 6)} units</span>
            <span className="text-muted-foreground">Position value</span><span className="font-medium text-right">{n(calc.value)}</span>
            <span className="text-muted-foreground">Reward : risk</span><span className="font-medium text-right">{n(calc.rr)} : 1</span>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          {riskBlocked && <p className="text-sm text-destructive">Risk above 1% is blocked while learning mode is on.</p>}
          {!err && calc.rr > 0 && calc.rr < 1.5 && (
            <p className="text-sm text-warning flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Reward-to-risk is below 1.5 — is this trade worth taking?</p>
          )}
          <label className="flex items-center gap-2 text-sm min-h-[40px]">
            <Checkbox checked={f.calendar} onCheckedChange={(v) => setF({ ...f, calendar: !!v })} /> I checked the economic calendar
          </label>
          <Button className="w-full h-12" onClick={submit} disabled={save.isPending || missing || !!err || riskBlocked}>Log paper trade</Button>
        </CardContent>
      </Card>

      {/* List */}
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">Trades</p>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={trades.length === 0}><Download className="h-4 w-4" /> Export trades to CSV</Button>
      </div>
      <div className="space-y-2">
        {trades.map((t) => <TradeRow key={t.id} t={t} onClose={() => setClosing(t)} onStop={() => setEditingStop(t)} />)}
        {trades.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No trades yet.</p>}
      </div>

      <CloseDialog trade={closing} balance={balance} onDone={() => { setClosing(null); refresh(); }} />
      <StopDialog trade={editingStop} onDone={() => { setEditingStop(null); refresh(); }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-semibold">{value}</p></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function TradeRow({ t, onClose, onStop }: { t: RuleTrade; onClose: () => void; onStop: () => void }) {
  if (t.is_legacy) {
    return (
      <Card><CardContent className="p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t.side.toUpperCase()} {t.symbol}</p>
          <p className="text-xs text-muted-foreground">{n(t.qty, 6)} @ {n(t.price_at_time, 4)} • {new Date(t.occurred_at).toLocaleDateString("en-ZA")}</p>
        </div>
        <Badge variant="secondary" className="text-xs">legacy</Badge>
      </CardContent></Card>
    );
  }
  const r = t.r_multiple === null ? null : Number(t.r_multiple);
  return (
    <Card><CardContent className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={t.direction === "long" ? "default" : "destructive"} className="text-xs uppercase">{t.direction}</Badge>
          <span className="text-sm font-medium">{t.symbol}</span>
          <span className="text-xs text-muted-foreground">{t.setup_name} • {t.timeframe}</span>
        </div>
        <Badge variant={t.status === "open" ? "outline" : "secondary"} className="text-xs">{t.status}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs">
        <span>Entry {n(t.entry_price, 5)}</span><span>Stop {n(t.stop_loss, 5)}</span><span>Target {n(t.target_price, 5)}</span>
        <span>Risk {n(t.risk_percent)}%</span>
        <span className={r === null ? "" : r > 0 ? "text-primary font-medium" : "text-destructive font-medium"}>R {r === null ? "—" : n(r)}</span>
        <span>Rule followed: {t.rule_followed === null ? "—" : t.rule_followed ? "Y" : "N"}</span>
      </div>
      {t.lesson && <p className="text-xs text-muted-foreground">Lesson: {t.lesson}</p>}
      <div className="flex gap-2 flex-wrap">
        {t.tradingview_symbol && (
          <Button asChild size="sm" variant="outline"><a href={tvChartUrl(t.tradingview_symbol)} target="_blank" rel="noopener noreferrer">Open in TradingView <ExternalLink className="h-3.5 w-3.5" /></a></Button>
        )}
        {t.status === "open" && <>
          <Button size="sm" variant="outline" onClick={onStop}>Move stop</Button>
          <Button size="sm" onClick={onClose}>Close trade</Button>
        </>}
      </div>
    </CardContent></Card>
  );
}

function StopDialog({ trade, onDone }: { trade: RuleTrade | null; onDone: () => void }) {
  const [v, setV] = useState("");
  if (!trade) return null;
  const entry = Number(trade.entry_price), oldStop = Number(trade.stop_loss);
  const next = parseFloat(v);
  const further = next > 0 && Math.abs(entry - next) > Math.abs(entry - oldStop);
  const save = async () => {
    if (!(next > 0) || further) return;
    try { await ruleTradeService.update(trade.id, { stop_loss: next }); toast.success("Stop updated"); setV(""); onDone(); }
    catch (e: any) { toast.error(e.message); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Move stop — {trade.symbol}</DialogTitle></DialogHeader>
        <p className="text-sm font-medium text-warning">Never move your stop loss further away.</p>
        <p className="text-xs text-muted-foreground">Entry {entry} • current stop {oldStop}. The new stop may only be closer to entry or the same.</p>
        <Input className="h-11" type="number" step="any" value={v} onChange={(e) => setV(e.target.value)} placeholder="New stop" />
        {further && <p className="text-sm text-destructive">That is further from entry — not allowed.</p>}
        <Button className="w-full h-11" onClick={save} disabled={!(next > 0) || further}>Save stop</Button>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ trade, balance, onDone }: { trade: RuleTrade | null; balance: number; onDone: () => void }) {
  const [exit, setExit] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rule, setRule] = useState<"" | "y" | "n">("");
  const [lesson, setLesson] = useState("");
  if (!trade) return null;
  const ex = parseFloat(exit);
  const r = ex > 0 ? rMultiple(trade.direction!, Number(trade.entry_price), Number(trade.stop_loss), ex) : null;
  const pnl = r === null ? null : r * Number(trade.risk_amount_zar ?? 0);
  const save = async () => {
    if (!(ex > 0) || !rule || !lesson.trim()) return toast.error("Exit price, rule followed and lesson are required.");
    try {
      await ruleTradeService.update(trade.id, { status: "closed", exit_price: ex, exit_date: date, rule_followed: rule === "y", lesson, r_multiple: r, pnl_zar: pnl });
      await settingsService.update({ paper_account_balance_zar: balance + (pnl ?? 0) });
      toast.success("Trade closed"); setExit(""); setRule(""); setLesson(""); onDone();
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Close {trade.symbol}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Input className="h-11" type="number" step="any" placeholder="Exit price" value={exit} onChange={(e) => setExit(e.target.value)} />
          <Input className="h-11" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Select value={rule} onValueChange={(v: any) => setRule(v)}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Rule followed? Y/N" /></SelectTrigger>
          <SelectContent><SelectItem value="y">Yes — followed my rules</SelectItem><SelectItem value="n">No — broke a rule</SelectItem></SelectContent>
        </Select>
        <Textarea rows={3} placeholder="Lesson learned (required)" value={lesson} onChange={(e) => setLesson(e.target.value)} />
        <div className="text-sm rounded-md border border-border p-3 grid grid-cols-2 gap-1">
          <span className="text-muted-foreground">R-multiple</span><span className="text-right font-medium">{r === null ? "—" : n(r)}</span>
          <span className="text-muted-foreground">P/L</span><span className="text-right font-medium">{pnl === null ? "—" : R(pnl)}</span>
        </div>
        <Button className="w-full h-11" onClick={save}>Close trade</Button>
      </DialogContent>
    </Dialog>
  );
}
