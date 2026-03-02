import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  watchlistService, watchlistItemService, holdingService, paperTradeService,
  marketDataService, alertService,
  type MarketPrice, type MarketNews, type ManualHolding, type PaperTrade,
  type Watchlist, type WatchlistItem, type InvestAlert,
} from "@/services/investService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  TrendingUp, TrendingDown, Globe, BookOpen, Eye, Briefcase,
  BarChart3, Bell, Brain, Plus, RefreshCw, Trash2, ArrowUpDown,
  DollarSign, AlertTriangle, Zap, ChevronRight, Info, Shield,
} from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number, decimals = 2) => n.toLocaleString("en-ZA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtR = (n: number) => `R ${fmt(n)}`;
const pctBadge = (pct: number) => (
  <Badge variant={pct > 0 ? "default" : pct < 0 ? "destructive" : "secondary"} className="text-xs">
    {pct > 0 ? "+" : ""}{fmt(pct, 2)}%
  </Badge>
);

// ── ASSET TYPE LABELS ──
const ASSET_TYPES = [
  { value: "fx", label: "Currency (FX)" },
  { value: "crypto", label: "Crypto" },
  { value: "commodity", label: "Commodity" },
  { value: "stock", label: "Stock/ETF" },
];

// ── COMMON SYMBOLS ──
const COMMON_SYMBOLS: Record<string, string[]> = {
  fx: ["USD/ZAR", "EUR/USD", "GBP/USD", "USD/JPY", "ZAR/USD", "EUR/ZAR"],
  crypto: ["BTC/USD", "ETH/USD"],
  commodity: ["XAU/USD"],
  stock: [],
};

// ── LEARN CONTENT ──
const LESSONS = [
  {
    id: "currency", title: "What is a Currency?", icon: "💱",
    content: "A currency is money used in a specific country. When you see USD/ZAR = 18.50, it means 1 US Dollar costs R18.50. When ZAR gets 'stronger', that number goes down — your Rand buys more. When ZAR gets 'weaker', it goes up — imports cost more.",
    keyTakeaway: "A weaker Rand means petrol, electronics, and imports cost more. A stronger Rand means cheaper imports.",
  },
  {
    id: "inflation", title: "What is Inflation?", icon: "📈",
    content: "Inflation means prices rise over time. If inflation is 6%, something that cost R100 last year costs R106 now. Central banks (like SA's Reserve Bank) raise interest rates to slow inflation. Higher rates make borrowing expensive but can strengthen the Rand.",
    keyTakeaway: "High inflation erodes your savings. Interest rate hikes fight inflation but slow the economy.",
  },
  {
    id: "stocks", title: "Stocks vs ETFs", icon: "🏢",
    content: "A stock is a tiny piece of a company. If you buy Naspers stock, you own a tiny fraction of Naspers. An ETF (Exchange-Traded Fund) bundles many stocks together — like buying a basket of companies at once. ETFs spread your risk automatically.",
    keyTakeaway: "ETFs are generally safer for beginners because they spread risk across many companies.",
  },
  {
    id: "crypto", title: "What is Crypto?", icon: "₿",
    content: "Cryptocurrency is digital money that runs on blockchain technology (a shared, tamper-proof ledger). Bitcoin (BTC) was the first. Ethereum (ETH) adds smart contracts. Crypto is highly volatile — prices can swing 10-20% in a day.",
    keyTakeaway: "Only invest what you can afford to lose. Crypto is exciting but extremely risky for beginners.",
  },
  {
    id: "commodities", title: "Oil & Gold: Why They Matter", icon: "🛢️",
    content: "Gold is a 'safe haven' — when markets panic, gold often rises. Oil affects everything: transport, food, manufacturing. SA imports oil, so oil price spikes mean higher petrol prices and inflation pressure.",
    keyTakeaway: "Gold rises in fear. Oil spikes hit SA consumers directly through petrol prices.",
  },
  {
    id: "risk", title: "Risk Basics for Beginners", icon: "🛡️",
    content: "Diversification means not putting all eggs in one basket. Long-term investing (5+ years) historically smooths out short-term crashes. The golden rule: only invest money you can afford to lose — never money needed for rent, food, or emergencies.",
    keyTakeaway: "Spread your investments, think long-term, and never invest emergency money.",
  },
];

// ══════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════
export default function InvestPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("pulse");

  // Queries
  const prices = useQuery({ queryKey: ["market_prices"], queryFn: marketDataService.getPrices, staleTime: 60_000 });
  const news = useQuery({ queryKey: ["market_news"], queryFn: marketDataService.getNews, staleTime: 60_000 });
  const watchlists = useQuery({ queryKey: ["invest_watchlists"], queryFn: watchlistService.list });
  const holdings = useQuery({ queryKey: ["invest_holdings"], queryFn: holdingService.list });
  const trades = useQuery({ queryKey: ["invest_paper_trades"], queryFn: paperTradeService.list });
  const alerts = useQuery({ queryKey: ["invest_alerts"], queryFn: alertService.list });

  const [refreshing, setRefreshing] = useState(false);
  const refreshPulse = async () => {
    setRefreshing(true);
    try {
      await marketDataService.refreshMarketPulse();
      qc.invalidateQueries({ queryKey: ["market_prices"] });
      qc.invalidateQueries({ queryKey: ["market_news"] });
      toast.success("Market data refreshed");
    } catch (e: any) { toast.error(e.message); }
    finally { setRefreshing(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" /> Invest & Trade
          </h1>
          <p className="text-sm text-muted-foreground">Your executive investment dashboard — learn, watch, practice</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" /> Paper Trading Mode</Badge>
          <Button variant="outline" size="sm" onClick={refreshPulse} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full overflow-x-auto no-scrollbar">
          <TabsTrigger value="pulse" className="shrink-0 px-3 text-xs sm:text-sm gap-1"><Globe className="h-3.5 w-3.5" /> Market Pulse</TabsTrigger>
          <TabsTrigger value="learn" className="shrink-0 px-3 text-xs sm:text-sm gap-1"><BookOpen className="h-3.5 w-3.5" /> Learn</TabsTrigger>
          <TabsTrigger value="watchlist" className="shrink-0 px-3 text-xs sm:text-sm gap-1"><Eye className="h-3.5 w-3.5" /> Watchlist</TabsTrigger>
          <TabsTrigger value="portfolio" className="shrink-0 px-3 text-xs sm:text-sm gap-1"><Briefcase className="h-3.5 w-3.5" /> Portfolio</TabsTrigger>
          <TabsTrigger value="paper" className="shrink-0 px-3 text-xs sm:text-sm gap-1"><ArrowUpDown className="h-3.5 w-3.5" /> Paper Trade</TabsTrigger>
          <TabsTrigger value="alerts" className="shrink-0 px-3 text-xs sm:text-sm gap-1"><Bell className="h-3.5 w-3.5" /> Alerts</TabsTrigger>
          <TabsTrigger value="mentor" className="shrink-0 px-3 text-xs sm:text-sm gap-1"><Brain className="h-3.5 w-3.5" /> AI Mentor</TabsTrigger>
        </TabsList>

        {/* ── MARKET PULSE ── */}
        <TabsContent value="pulse" className="space-y-4">
          <MarketPulseTab prices={prices.data ?? []} news={news.data ?? []} loading={prices.isLoading} />
        </TabsContent>

        {/* ── LEARN ── */}
        <TabsContent value="learn" className="space-y-4">
          <LearnTab />
        </TabsContent>

        {/* ── WATCHLIST ── */}
        <TabsContent value="watchlist" className="space-y-4">
          <WatchlistTab watchlists={watchlists.data ?? []} prices={prices.data ?? []} onRefresh={() => qc.invalidateQueries({ queryKey: ["invest_watchlists"] })} />
        </TabsContent>

        {/* ── PORTFOLIO ── */}
        <TabsContent value="portfolio" className="space-y-4">
          <PortfolioTab holdings={holdings.data ?? []} prices={prices.data ?? []} onRefresh={() => qc.invalidateQueries({ queryKey: ["invest_holdings"] })} />
        </TabsContent>

        {/* ── PAPER TRADE ── */}
        <TabsContent value="paper" className="space-y-4">
          <PaperTradeTab trades={trades.data ?? []} prices={prices.data ?? []} onRefresh={() => qc.invalidateQueries({ queryKey: ["invest_paper_trades"] })} />
        </TabsContent>

        {/* ── ALERTS ── */}
        <TabsContent value="alerts" className="space-y-4">
          <AlertsTab alerts={alerts.data ?? []} onRefresh={() => qc.invalidateQueries({ queryKey: ["invest_alerts"] })} />
        </TabsContent>

        {/* ── AI MENTOR ── */}
        <TabsContent value="mentor" className="space-y-4">
          <AIMentorTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ══════════════════════════════════════════════════
// MARKET PULSE TAB
// ══════════════════════════════════════════════════
function MarketPulseTab({ prices, news, loading }: { prices: MarketPrice[]; news: MarketNews[]; loading: boolean }) {
  const [detailAsset, setDetailAsset] = useState<MarketPrice | null>(null);

  const fxPrices = prices.filter(p => p.asset_type === "fx");
  const cryptoPrices = prices.filter(p => p.asset_type === "crypto");
  const commodityPrices = prices.filter(p => p.asset_type === "commodity");

  const zarPair = prices.find(p => p.symbol === "USD/ZAR");
  const riskMood = zarPair ? (zarPair.change_1d > 0.5 ? "Risk-Off" : zarPair.change_1d < -0.5 ? "Risk-On" : "Neutral") : "Unknown";

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-32" />)}</div>;

  return (
    <>
      {/* Risk Mood */}
      <Card className="border-l-4 border-l-primary">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Global Risk Mood Today</p>
              <p className="text-2xl font-bold mt-1">{riskMood}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {riskMood === "Risk-On" ? "Markets are optimistic. Investors buying riskier assets (stocks, crypto). ZAR may strengthen." :
                 riskMood === "Risk-Off" ? "Markets are cautious. Investors moving to safe assets (gold, USD). ZAR may weaken." :
                 "Markets are mixed. No strong directional signal today."}
              </p>
            </div>
            <div className="text-4xl">{riskMood === "Risk-On" ? "🟢" : riskMood === "Risk-Off" ? "🔴" : "🟡"}</div>
          </div>
        </CardContent>
      </Card>

      {/* USD/ZAR Spotlight */}
      {zarPair && (
        <Card className="bg-primary/5 border-primary/20 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailAsset(zarPair)}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">🇿🇦 USD/ZAR (SA Rand)</p>
                <p className="text-3xl font-bold mt-1">R {fmt(zarPair.price, 4)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {zarPair.change_1d < 0 ? "ZAR is stronger today — your Rand buys more USD ✅" :
                   zarPair.change_1d > 0 ? "ZAR is weaker today — imports and petrol may cost more ⚠️" :
                   "ZAR is flat today — no major change"}
                </p>
              </div>
              <div className="text-right">
                {pctBadge(zarPair.change_1d)}
                <p className="text-xs text-muted-foreground mt-1">1-day change</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* FX / Crypto / Commodities Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* FX */}
        {fxPrices.filter(p => p.symbol !== "USD/ZAR").map(p => (
          <Card key={p.symbol} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailAsset(p)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">💱 {p.symbol}</p>
                <p className="text-lg font-bold">{fmt(p.price, 4)}</p>
              </div>
              {pctBadge(p.change_1d)}
            </CardContent>
          </Card>
        ))}

        {/* Crypto */}
        {cryptoPrices.map(p => (
          <Card key={p.symbol} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailAsset(p)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{p.symbol.startsWith("BTC") ? "₿" : "Ξ"} {p.symbol}</p>
                <p className="text-lg font-bold">${fmt(p.price, 2)}</p>
              </div>
              {pctBadge(p.change_1d)}
            </CardContent>
          </Card>
        ))}

        {/* Commodities */}
        {commodityPrices.map(p => (
          <Card key={p.symbol} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setDetailAsset(p)}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">{p.symbol.includes("XAU") ? "🥇" : "🛢️"} {p.symbol}</p>
                <p className="text-lg font-bold">${fmt(p.price, 2)}</p>
              </div>
              {pctBadge(p.change_1d)}
            </CardContent>
          </Card>
        ))}

        {prices.length === 0 && (
          <Card className="col-span-full">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No market data yet. Click <strong>Refresh</strong> to load today's prices.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Headlines */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Macro & Geopolitics</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {news.length === 0 ? (
            <p className="text-sm text-muted-foreground">No headlines yet. Refresh market data to generate today's summary.</p>
          ) : news.map(n => (
            <div key={n.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <p className="font-medium text-sm">{n.title}</p>
              {n.summary && <p className="text-xs text-muted-foreground mt-1">{n.summary}</p>}
              {Array.isArray(n.tags) && n.tags.length > 0 && (
                <div className="flex gap-1 mt-1">{(n.tags as string[]).map(t => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}</div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Asset Detail Drawer */}
      <Sheet open={!!detailAsset} onOpenChange={(o) => !o && setDetailAsset(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{detailAsset?.symbol}</SheetTitle>
            <SheetDescription>{detailAsset?.asset_type.toUpperCase()} • {detailAsset?.currency}</SheetDescription>
          </SheetHeader>
          {detailAsset && (
            <div className="mt-4 space-y-4">
              <div className="text-center">
                <p className="text-3xl font-bold">{detailAsset.currency === "USD" ? "$" : "R "}{fmt(detailAsset.price, detailAsset.asset_type === "fx" ? 4 : 2)}</p>
                <div className="mt-1">{pctBadge(detailAsset.change_1d)}</div>
              </div>
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="font-medium text-sm flex items-center gap-1"><Info className="h-3.5 w-3.5" /> What is this?</p>
                  <p className="text-xs text-muted-foreground">
                    {detailAsset.asset_type === "fx" ? `This is a foreign exchange rate. It shows how much one unit of ${detailAsset.symbol.split("/")[0]} costs in ${detailAsset.symbol.split("/")[1]}.` :
                     detailAsset.asset_type === "crypto" ? "This is a cryptocurrency — digital money that runs on blockchain technology. Highly volatile." :
                     "This is a commodity — a physical good traded on global markets."}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="font-medium text-sm">🎯 Why it matters</p>
                  <p className="text-xs text-muted-foreground">
                    {detailAsset.symbol === "USD/ZAR" ? "This rate directly affects the cost of imported goods, petrol, and electronics in South Africa." :
                     detailAsset.asset_type === "crypto" ? "Crypto markets can signal broader risk appetite. Large swings may affect other asset classes." :
                     "Commodity prices affect manufacturing costs, inflation, and consumer prices globally."}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="font-medium text-sm">✅ Safe next steps</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Add to your watchlist to track daily</li>
                    <li>• Set a price alert to be notified of changes</li>
                    <li>• Try a paper trade to practice</li>
                    <li>• Read the Learn section for more context</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ══════════════════════════════════════════════════
// LEARN TAB
// ══════════════════════════════════════════════════
function LearnTab() {
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  return (
    <>
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <p className="font-medium">📚 Investment Basics for Beginners</p>
          <p className="text-sm text-muted-foreground mt-1">Short, plain-language lessons to help you understand markets. No jargon, no hype — just clarity.</p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {LESSONS.map(lesson => (
          <Card key={lesson.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOpenLesson(lesson.id)}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{lesson.icon}</span>
                <div>
                  <p className="font-medium text-sm">{lesson.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lesson.content.slice(0, 100)}...</p>
                  <Button variant="link" className="p-0 h-auto text-xs mt-1">Read more →</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lesson Drawer */}
      <Sheet open={!!openLesson} onOpenChange={(o) => !o && setOpenLesson(null)}>
        <SheetContent>
          {openLesson && (() => {
            const lesson = LESSONS.find(l => l.id === openLesson)!;
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{lesson.icon} {lesson.title}</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-4">
                  <p className="text-sm leading-relaxed">{lesson.content}</p>
                  <Card className="bg-accent/10 border-accent/20">
                    <CardContent className="p-4">
                      <p className="font-medium text-sm">💡 Key Takeaway</p>
                      <p className="text-sm text-muted-foreground mt-1">{lesson.keyTakeaway}</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ══════════════════════════════════════════════════
// WATCHLIST TAB
// ══════════════════════════════════════════════════
function WatchlistTab({ watchlists, prices, onRefresh }: { watchlists: Watchlist[]; prices: MarketPrice[]; onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [selWatchlist, setSelWatchlist] = useState<string | null>(null);
  const [addSymbol, setAddSymbol] = useState("");
  const [addType, setAddType] = useState("fx");

  const items = useQuery({
    queryKey: ["invest_watchlist_items", selWatchlist],
    queryFn: () => selWatchlist ? watchlistItemService.list(selWatchlist) : Promise.resolve([]),
    enabled: !!selWatchlist,
  });

  const createWL = useMutation({
    mutationFn: () => watchlistService.create(name),
    onSuccess: () => { onRefresh(); setShowAdd(false); setName(""); toast.success("Watchlist created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const addItem = useMutation({
    mutationFn: () => watchlistItemService.add(selWatchlist!, addSymbol, addType),
    onSuccess: () => { items.refetch(); setAddSymbol(""); toast.success("Added to watchlist"); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: watchlistItemService.remove,
    onSuccess: () => items.refetch(),
  });

  const activeWL = selWatchlist || (watchlists.length > 0 ? watchlists[0].id : null);
  if (activeWL && !selWatchlist && watchlists.length > 0) setSelWatchlist(watchlists[0].id);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {watchlists.map(wl => (
          <Button key={wl.id} variant={selWatchlist === wl.id ? "default" : "outline"} size="sm" onClick={() => setSelWatchlist(wl.id)}>
            {wl.name}
          </Button>
        ))}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Watchlist</DialogTitle></DialogHeader>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createWL.mutate(); }}>
              <Input placeholder="Watchlist name (e.g. ZAR Watch)" value={name} onChange={(e) => setName(e.target.value)} required />
              <Button type="submit" className="w-full" disabled={createWL.isPending}>Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {selWatchlist && (
        <>
          {/* Add symbol */}
          <Card>
            <CardContent className="p-4">
              <form className="flex gap-2 flex-wrap" onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }}>
                <Select value={addType} onValueChange={setAddType}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={addSymbol} onValueChange={setAddSymbol}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Select symbol" /></SelectTrigger>
                  <SelectContent>
                    {(COMMON_SYMBOLS[addType] ?? []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="submit" size="sm" disabled={!addSymbol || addItem.isPending}>Add</Button>
              </form>
            </CardContent>
          </Card>

          {/* Items */}
          <div className="space-y-2">
            {(items.data ?? []).map(item => {
              const price = prices.find(p => p.symbol === item.symbol);
              return (
                <Card key={item.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{item.symbol}</p>
                      <p className="text-xs text-muted-foreground">{item.asset_type}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {price ? (
                        <div className="text-right">
                          <p className="font-medium text-sm">{fmt(price.price, price.asset_type === "fx" ? 4 : 2)}</p>
                          {pctBadge(price.change_1d)}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">No data</span>}
                      <Button variant="ghost" size="icon" onClick={() => removeItem.mutate(item.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {(items.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Add assets above to start watching.</p>
            )}
          </div>
        </>
      )}

      {watchlists.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Create your first watchlist to track assets you're interested in.</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════
// PORTFOLIO TAB
// ══════════════════════════════════════════════════
function PortfolioTab({ holdings, prices, onRefresh }: { holdings: ManualHolding[]; prices: MarketPrice[]; onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [assetType, setAssetType] = useState("stock");
  const [qty, setQty] = useState("");
  const [avgCost, setAvgCost] = useState("");
  const [currency, setCurrency] = useState("ZAR");

  const createHolding = useMutation({
    mutationFn: () => holdingService.create({
      symbol, asset_type: assetType, qty: parseFloat(qty),
      avg_cost: avgCost ? parseFloat(avgCost) : undefined, currency,
    }),
    onSuccess: () => { onRefresh(); setShowAdd(false); setSymbol(""); setQty(""); toast.success("Holding added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const removeHolding = useMutation({
    mutationFn: holdingService.remove,
    onSuccess: onRefresh,
  });

  const totalValue = holdings.reduce((sum, h) => {
    const price = prices.find(p => p.symbol === h.symbol);
    return sum + (price ? price.price * Number(h.qty) : Number(h.avg_cost ?? 0) * Number(h.qty));
  }, 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Estimated Portfolio Value</p>
          <p className="text-2xl font-bold">{fmtR(totalValue)}</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> Add Holding</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Manual Holding</DialogTitle></DialogHeader>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createHolding.mutate(); }}>
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Symbol (e.g. BTC/USD, USD/ZAR)" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} required />
              <div className="grid grid-cols-2 gap-3">
                <Input type="number" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} required min="0" step="any" />
                <Input type="number" placeholder="Avg cost (optional)" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} min="0" step="any" />
              </div>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZAR">ZAR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full" disabled={createHolding.isPending}>Add Holding</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Holdings list */}
      <div className="space-y-2">
        {holdings.map(h => {
          const price = prices.find(p => p.symbol === h.symbol);
          const currentVal = price ? price.price * Number(h.qty) : Number(h.avg_cost ?? 0) * Number(h.qty);
          return (
            <Card key={h.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{h.symbol}</p>
                  <p className="text-xs text-muted-foreground">{h.asset_type} • {Number(h.qty)} units • {h.currency}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-medium text-sm">{h.currency === "ZAR" ? fmtR(currentVal) : `$${fmt(currentVal)}`}</p>
                    {price && <div className="mt-0.5">{pctBadge(price.change_1d)}</div>}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeHolding.mutate(h.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {holdings.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Track your investments here. Add holdings manually (including crypto, FX, commodities).</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════
// PAPER TRADE TAB
// ══════════════════════════════════════════════════
function PaperTradeTab({ trades, prices, onRefresh }: { trades: PaperTrade[]; prices: MarketPrice[]; onRefresh: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [assetType, setAssetType] = useState("fx");
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const currentPrice = prices.find(p => p.symbol === symbol);

  const executeTrade = useMutation({
    mutationFn: () => paperTradeService.create({
      symbol, asset_type: assetType, side, qty: parseFloat(qty),
      price_at_time: currentPrice?.price ?? 0,
    }),
    onSuccess: () => { onRefresh(); setShowConfirm(false); setQty(""); toast.success(`Paper ${side} executed ✓`); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <Card className="bg-accent/5 border-accent/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            <div>
              <p className="font-medium text-sm">Paper Trading — Practice Mode</p>
              <p className="text-xs text-muted-foreground">No real money is used. Practice buy/sell to learn how markets work.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trade Ticket */}
      <Card>
        <CardHeader><CardTitle className="text-base">New Paper Trade</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Select value={assetType} onValueChange={(v) => { setAssetType(v); setSymbol(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ASSET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger><SelectValue placeholder="Symbol" /></SelectTrigger>
              <SelectContent>
                {(COMMON_SYMBOLS[assetType] ?? []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select value={side} onValueChange={setSide}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">🟢 Buy</SelectItem>
                <SelectItem value="sell">🔴 Sell</SelectItem>
              </SelectContent>
            </Select>
            <Input type="number" placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} min="0" step="any" />
          </div>
          {currentPrice && (
            <p className="text-sm text-muted-foreground">Current price: {currentPrice.currency === "USD" ? "$" : "R "}{fmt(currentPrice.price, currentPrice.asset_type === "fx" ? 4 : 2)}</p>
          )}
          <Button className="w-full" disabled={!symbol || !qty} onClick={() => setShowConfirm(true)}>
            Review Trade
          </Button>
        </CardContent>
      </Card>

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Paper Trade</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p className="text-muted-foreground">Asset:</p><p className="font-medium">{symbol}</p>
              <p className="text-muted-foreground">Side:</p><p className="font-medium">{side.toUpperCase()}</p>
              <p className="text-muted-foreground">Quantity:</p><p className="font-medium">{qty}</p>
              <p className="text-muted-foreground">Price:</p><p className="font-medium">{currentPrice ? fmt(currentPrice.price, 4) : "N/A"}</p>
            </div>
            <Card className="bg-warning/10 border-warning/30">
              <CardContent className="p-3">
                <p className="text-xs text-warning flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> This is a paper trade — no real money is involved.</p>
              </CardContent>
            </Card>
            <Button className="w-full" onClick={() => executeTrade.mutate()} disabled={executeTrade.isPending}>
              {executeTrade.isPending ? "Executing..." : `Confirm Paper ${side.toUpperCase()}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trade History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Trade History</CardTitle></CardHeader>
        <CardContent>
          {trades.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No paper trades yet. Start practicing above!</p>
          ) : (
            <div className="space-y-2">
              {trades.slice(0, 20).map(t => (
                <div key={t.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{t.side === "buy" ? "🟢" : "🔴"} {t.side.toUpperCase()} {t.symbol}</p>
                    <p className="text-xs text-muted-foreground">{Number(t.qty)} @ {fmt(Number(t.price_at_time), 4)} • {new Date(t.occurred_at).toLocaleDateString("en-ZA")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ══════════════════════════════════════════════════
// ALERTS TAB
// ══════════════════════════════════════════════════
function AlertsTab({ alerts, onRefresh }: { alerts: InvestAlert[]; onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [symbol, setSymbol] = useState("USD/ZAR");
  const [assetType, setAssetType] = useState("fx");
  const [ruleType, setRuleType] = useState("price_above");
  const [threshold, setThreshold] = useState("");

  const createAlert = useMutation({
    mutationFn: () => alertService.create({
      symbol, asset_type: assetType, rule_type: ruleType,
      params: { threshold: parseFloat(threshold) },
    }),
    onSuccess: () => { onRefresh(); setShowAdd(false); setThreshold(""); toast.success("Alert created"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleAlert = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => alertService.toggle(id, enabled),
    onSuccess: onRefresh,
  });

  const removeAlert = useMutation({
    mutationFn: alertService.remove,
    onSuccess: onRefresh,
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{alerts.filter(a => a.enabled).length} active alerts</p>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> New Alert</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Price Alert</DialogTitle></DialogHeader>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createAlert.mutate(); }}>
              <Input placeholder="Symbol (e.g. USD/ZAR)" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} required />
              <Select value={ruleType} onValueChange={setRuleType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="price_above">Price goes above</SelectItem>
                  <SelectItem value="price_below">Price goes below</SelectItem>
                  <SelectItem value="change_pct">Daily change exceeds %</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Threshold value" value={threshold} onChange={(e) => setThreshold(e.target.value)} required step="any" />
              <Button type="submit" className="w-full" disabled={createAlert.isPending}>Create Alert</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {alerts.map(a => (
          <Card key={a.id}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{a.symbol}</p>
                <p className="text-xs text-muted-foreground">
                  {a.rule_type === "price_above" ? "Above" : a.rule_type === "price_below" ? "Below" : "Change >"} {a.params?.threshold}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={a.enabled} onCheckedChange={(v) => toggleAlert.mutate({ id: a.id, enabled: v })} />
                <Button variant="ghost" size="icon" onClick={() => removeAlert.mutate(a.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {alerts.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Set alerts to be notified when prices cross your thresholds.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════
// AI MENTOR TAB
// ══════════════════════════════════════════════════
function AIMentorTab() {
  const [mode, setMode] = useState("briefing");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runMentor = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("invest-ai-mentor", {
        body: { mode, question: question || undefined },
      });
      if (error) throw error;
      setResult(data);
      if (data.ai_status === "ok") toast.success("Briefing generated");
      else toast.warning(data.error || "Issue generating briefing");
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  };

  return (
    <>
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-sm">AI Investment Coach</p>
              <p className="text-xs text-muted-foreground">Your personal coach explains markets in plain language. Never gives "buy now" advice.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        <Button variant={mode === "briefing" ? "default" : "outline"} size="sm" onClick={() => setMode("briefing")}>📊 Today's Briefing</Button>
        <Button variant={mode === "teach" ? "default" : "outline"} size="sm" onClick={() => setMode("teach")}>📚 Teach Me</Button>
        <Button variant={mode === "nextstep" ? "default" : "outline"} size="sm" onClick={() => setMode("nextstep")}>🎯 Safe Next Steps</Button>
      </div>

      {mode === "teach" && (
        <Input placeholder="What would you like to learn? (e.g. 'What is an ETF?')" value={question} onChange={(e) => setQuestion(e.target.value)} />
      )}

      <Button onClick={runMentor} disabled={loading} className="w-full sm:w-auto">
        {loading ? "Generating..." : "Generate Briefing"}
      </Button>

      {result && (
        <div className="space-y-4">
          {/* Summary */}
          {result.summary && (
            <Card>
              <CardContent className="p-4">
                <p className="font-medium text-sm mb-2">Executive Summary</p>
                <p className="text-sm whitespace-pre-wrap">{result.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* What Moved */}
          {result.what_moved && result.what_moved.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="font-medium text-sm mb-2">📈 What Moved</p>
                <div className="space-y-2">
                  {result.what_moved.map((m: any, i: number) => (
                    <div key={i} className="border-b border-border pb-2 last:border-0 last:pb-0">
                      <p className="text-sm font-medium">{m.asset}: {m.change}</p>
                      <p className="text-xs text-muted-foreground">{m.explanation}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Why It Matters */}
          {result.why_it_matters && result.why_it_matters.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="font-medium text-sm mb-2">💡 Why It Matters</p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {result.why_it_matters.map((w: string, i: number) => <li key={i}>• {w}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Safe Actions */}
          {result.safe_actions && result.safe_actions.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="font-medium text-sm mb-2">✅ Safe Actions</p>
                <div className="space-y-2">
                  {result.safe_actions.map((a: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <Badge variant="outline" className="text-xs shrink-0">{a.type}</Badge>
                      <div>
                        <p className="text-sm">{a.action}</p>
                        <p className="text-xs text-muted-foreground">{a.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Freeform */}
          {result.freeform && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm whitespace-pre-wrap">{result.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Disclaimer */}
          {result.disclaimer && (
            <p className="text-xs text-muted-foreground italic">{result.disclaimer}</p>
          )}
        </div>
      )}
    </>
  );
}
