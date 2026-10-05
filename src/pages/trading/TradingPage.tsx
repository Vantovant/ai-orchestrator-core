import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { marketDataService, holdingService, alertService } from "@/services/investService";
import { settingsService, ruleTradeService, courseService } from "@/services/tradingService";
import { PortfolioTab, AlertsTab, AIMentorTab } from "@/pages/InvestPage";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CandlestickChart, RefreshCw, Shield, Info } from "lucide-react";
import { toast } from "sonner";
import OverviewTab from "./OverviewTab";
import WatchlistTab from "./WatchlistTab";
import PaperTradeTab from "./PaperTradeTab";
import PlanTab from "./PlanTab";
import CourseTab from "./CourseTab";

export default function TradingPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  useEffect(() => { document.title = "Trading"; }, []);

  const prices = useQuery({ queryKey: ["market_prices"], queryFn: marketDataService.getPrices, staleTime: 60_000 });
  const settings = useQuery({ queryKey: ["trading_settings"], queryFn: settingsService.get });
  const trades = useQuery({ queryKey: ["rule_trades"], queryFn: ruleTradeService.list });
  const course = useQuery({ queryKey: ["trading_course"], queryFn: courseService.list });
  const holdings = useQuery({ queryKey: ["invest_holdings"], queryFn: holdingService.list });
  const alerts = useQuery({ queryKey: ["invest_alerts"], queryFn: alertService.list });

  const completed = (course.data ?? []).filter((p) => p.status === "completed").map((p) => p.lesson_no);
  let current = 1; while (completed.includes(current) && current < 12) current++;
  const allDone = completed.length >= 12;

  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try { await marketDataService.refreshMarketPulse(); await qc.invalidateQueries({ queryKey: ["market_prices"] }); toast.success("Prices refreshed"); }
    catch (e: any) { toast.error(e.message); } finally { setRefreshing(false); }
  };
  const refreshTrading = () => { settings.refetch(); trades.refetch(); course.refetch(); };

  return (
    <div className="space-y-4 pb-6 w-full max-w-full min-w-0 overflow-x-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CandlestickChart className="h-6 w-6 text-primary" /> Trading</h1>
          <p className="text-sm text-muted-foreground">{allDone ? "Course complete — 12 of 12" : `Lesson ${current} of 12`}</p>
        </div>
        <Button variant="outline" size="sm" className="h-10" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>
      <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" /> Paper trading — learning mode</Badge>

      <Tabs value={tab} onValueChange={setTab} className="w-full min-w-0">
        <TabsList className="flex w-full max-w-full overflow-x-auto no-scrollbar justify-start">
          {[["overview", "Overview"], ["course", "Course"], ["plan", "Trading Plan"], ["paper", "Paper Trade"], ["watchlist", "Watchlist"], ["portfolio", "Portfolio"], ["alerts", "Alerts"], ["mentor", "AI Mentor"]].map(([v, l]) => (
            <TabsTrigger key={v} value={v} className="shrink-0 px-3 text-xs sm:text-sm">{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview"><OverviewTab prices={prices.data ?? []} loading={prices.isLoading} /></TabsContent>
        <TabsContent value="course">
          {settings.data ? <CourseTab settings={settings.data} progress={course.data ?? []} refresh={refreshTrading} /> : <Skeleton className="h-64" />}
        </TabsContent>
        <TabsContent value="plan"><PlanTab /></TabsContent>
        <TabsContent value="paper">
          {settings.data ? <PaperTradeTab trades={trades.data ?? []} settings={settings.data} refresh={refreshTrading} /> : <Skeleton className="h-64" />}
        </TabsContent>
        <TabsContent value="watchlist"><WatchlistTab prices={prices.data ?? []} /></TabsContent>
        <TabsContent value="portfolio" className="space-y-4">
          <PortfolioTab holdings={holdings.data ?? []} prices={prices.data ?? []} onRefresh={() => holdings.refetch()} />
        </TabsContent>
        <TabsContent value="alerts" className="space-y-4">
          <Card className="border-warning/40 bg-warning/10"><CardContent className="p-3 text-sm flex gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" /> Alerts are saved here but not yet monitored. Set live price alerts in TradingView for now.
          </CardContent></Card>
          <AlertsTab alerts={alerts.data ?? []} onRefresh={() => alerts.refetch()} />
        </TabsContent>
        <TabsContent value="mentor" className="space-y-4">
          <p className="text-xs text-muted-foreground">Educational only — not financial advice. You make every decision. The coach has no news feed; it only explains the prices shown here.</p>
          <AIMentorTab />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center border-t border-border pt-4">
        Use FSCA-regulated providers. Keep records of all trades — SARS taxes trading and crypto profits.
      </p>
    </div>
  );
}
