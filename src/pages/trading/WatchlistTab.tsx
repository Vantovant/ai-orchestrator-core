import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { watchlistService, watchlistItemService, type MarketPrice, type WatchlistItem } from "@/services/investService";
import { keyLevelService, setWatchItemTvSymbol, defaultTvSymbol, tvChartUrl, type KeyLevel } from "@/services/tradingService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ExternalLink, Plus, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import TradingViewChart from "./TradingViewChart";
import { ChangeBadge } from "./OverviewTab";

const ASSET_TYPES = [
  { value: "fx", label: "Currency" }, { value: "crypto", label: "Crypto" },
  { value: "commodity", label: "Commodity" }, { value: "stock", label: "Stock/ETF" },
];

export default function WatchlistTab({ prices }: { prices: MarketPrice[] }) {
  const qc = useQueryClient();
  const watchlists = useQuery({ queryKey: ["invest_watchlists"], queryFn: watchlistService.list });
  const [sel, setSel] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [type, setType] = useState("fx");
  const [detail, setDetail] = useState<(WatchlistItem & { tradingview_symbol?: string | null }) | null>(null);

  useEffect(() => { if (!sel && watchlists.data?.length) setSel(watchlists.data[0].id); }, [watchlists.data, sel]);

  const items = useQuery({
    queryKey: ["invest_watchlist_items", sel],
    queryFn: () => watchlistItemService.list(sel!),
    enabled: !!sel,
  });

  const create = useMutation({
    mutationFn: () => watchlistService.create(newName),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invest_watchlists"] }); setShowNew(false); setNewName(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: async () => {
      const it = await watchlistItemService.add(sel!, symbol.toUpperCase(), type);
      await setWatchItemTvSymbol(it.id, defaultTvSymbol(symbol));
    },
    onSuccess: () => { items.refetch(); setSymbol(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const remove = useMutation({ mutationFn: watchlistItemService.remove, onSuccess: () => items.refetch() });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {(watchlists.data ?? []).map((w) => (
          <Button key={w.id} size="sm" variant={sel === w.id ? "default" : "outline"} onClick={() => setSel(w.id)} className="shrink-0">{w.name}</Button>
        ))}
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="shrink-0"><Plus className="h-4 w-4" /> New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New watchlist</DialogTitle></DialogHeader>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
              <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              <Button type="submit" className="w-full h-11">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sel && (
        <Card><CardContent className="p-4">
          <form className="grid grid-cols-[110px_1fr_auto] gap-2" onSubmit={(e) => { e.preventDefault(); if (symbol) add.mutate(); }}>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{ASSET_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-11" placeholder="Symbol e.g. BTC/USD" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
            <Button type="submit" className="h-11" disabled={!symbol || add.isPending}>Add</Button>
          </form>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {(items.data ?? []).map((it: any) => {
          const p = prices.find((x) => x.symbol === it.symbol);
          return (
            <Card key={it.id} className="cursor-pointer" onClick={() => setDetail(it)}>
              <CardContent className="p-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{it.symbol}</p>
                  <p className="text-xs text-muted-foreground truncate">{it.tradingview_symbol ?? defaultTvSymbol(it.symbol)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {p ? <ChangeBadge value={p.change_1d} /> : null}
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); remove.mutate(it.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
        {sel && (items.data ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Add a symbol above.</p>}
        {(watchlists.data ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Create your first watchlist.</p>}
      </div>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent side="bottom" className="h-[92vh] overflow-y-auto sm:max-w-none">
          {detail && <ItemDetail item={detail} onSaved={() => items.refetch()} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ItemDetail({ item, onSaved }: { item: WatchlistItem & { tradingview_symbol?: string | null }; onSaved: () => void }) {
  const [tv, setTv] = useState(item.tradingview_symbol || defaultTvSymbol(item.symbol));
  const [chartSym, setChartSym] = useState(tv);
  const levels = useQuery({ queryKey: ["key_levels", item.id], queryFn: () => keyLevelService.list(item.id) });
  const [f, setF] = useState({ low: "", high: "", type: "support", tf: "1D", note: "", source: "me" });

  const saveTv = async () => {
    try { await setWatchItemTvSymbol(item.id, tv.trim().toUpperCase()); setChartSym(tv.trim().toUpperCase()); onSaved(); toast.success("Saved"); }
    catch (e: any) { toast.error(e.message); }
  };
  const addLevel = useMutation({
    mutationFn: () => {
      const lo = parseFloat(f.low), hi = parseFloat(f.high);
      if (!(lo > 0 && hi > 0)) throw new Error("Enter zone low and high");
      return keyLevelService.create({
        watchlist_item_id: item.id, zone_low: Math.min(lo, hi), zone_high: Math.max(lo, hi),
        level_type: f.type as KeyLevel["level_type"], timeframe: f.tf, note: f.note || null,
        source: f.source as KeyLevel["source"], verified: false,
      });
    },
    onSuccess: () => { levels.refetch(); setF({ ...f, low: "", high: "", note: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 pb-8">
      <SheetHeader><SheetTitle>{item.symbol}</SheetTitle></SheetHeader>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input className="h-11" value={tv} onChange={(e) => setTv(e.target.value)} placeholder="TradingView symbol e.g. FX:USDZAR" />
        <Button className="h-11" variant="outline" onClick={saveTv}>Save</Button>
      </div>
      <Button asChild className="w-full h-11">
        <a href={tvChartUrl(chartSym)} target="_blank" rel="noopener noreferrer">Open in TradingView <ExternalLink className="h-4 w-4" /></a>
      </Button>
      <TradingViewChart symbol={chartSym} />

      <div className="space-y-2">
        <p className="font-medium text-sm">Key levels</p>
        {(levels.data ?? []).map((l) => (
          <Card key={l.id}><CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={l.level_type === "support" ? "default" : "destructive"} className="text-xs capitalize">{l.level_type}</Badge>
                <span className="text-sm font-medium">{l.zone_low} – {l.zone_high}</span>
                {l.timeframe && <Badge variant="outline" className="text-xs">{l.timeframe}</Badge>}
                {l.source === "claude" && !l.verified && <Badge variant="secondary" className="text-xs">draft — verify</Badge>}
              </div>
              <Button variant="ghost" size="icon" onClick={async () => { await keyLevelService.remove(l.id); levels.refetch(); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
            {l.note && <p className="text-xs text-muted-foreground">{l.note}</p>}
            <label className="flex items-center gap-2 text-xs min-h-[32px]">
              <Checkbox checked={l.verified} onCheckedChange={async (v) => { await keyLevelService.update(l.id, { verified: !!v }); levels.refetch(); }} />
              I verified this on the chart myself
            </label>
          </CardContent></Card>
        ))}
        <Card><CardContent className="p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input className="h-11" type="number" step="any" placeholder="Zone low" value={f.low} onChange={(e) => setF({ ...f, low: e.target.value })} />
            <Input className="h-11" type="number" step="any" placeholder="Zone high" value={f.high} onChange={(e) => setF({ ...f, high: e.target.value })} />
            <Select value={f.type} onValueChange={(v) => setF({ ...f, type: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="support">Support</SelectItem><SelectItem value="resistance">Resistance</SelectItem></SelectContent>
            </Select>
            <Input className="h-11" placeholder="Timeframe e.g. 4H" value={f.tf} onChange={(e) => setF({ ...f, tf: e.target.value })} />
            <Select value={f.source} onValueChange={(v) => setF({ ...f, source: v })}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="me">Source: me</SelectItem><SelectItem value="claude">Source: Claude draft</SelectItem></SelectContent>
            </Select>
            <Input className="h-11" placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </div>
          <Button className="w-full h-11" onClick={() => addLevel.mutate()} disabled={addLevel.isPending}><Plus className="h-4 w-4" /> Add key level</Button>
        </CardContent></Card>
      </div>
    </div>
  );
}
