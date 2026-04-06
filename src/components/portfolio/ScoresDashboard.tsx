import { useQuery } from "@tanstack/react-query";
import { partnerScoresService, type PartnerScores } from "@/services/partnerScoresService";
import { portfolioChatService, type ScoreHistory } from "@/services/portfolioChatService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";

interface Props {
  projects: { id: string; name: string; status: string; updated_at: string }[];
}

export default function ScoresDashboard({ projects }: Props) {
  const scores = useQuery({ queryKey: ["partner_scores_all"], queryFn: partnerScoresService.listAll });
  const history = useQuery({ queryKey: ["score_history_all"], queryFn: () => portfolioChatService.getAllScoreHistory(100) });

  const scoreMap = new Map<string, PartnerScores>();
  (scores.data ?? []).forEach(s => scoreMap.set(s.project_id, s));

  // Build history per project (last 5 entries)
  const historyMap = new Map<string, ScoreHistory[]>();
  (history.data ?? []).forEach(h => {
    const arr = historyMap.get(h.project_id) || [];
    if (arr.length < 5) arr.push(h);
    historyMap.set(h.project_id, arr);
  });

  const riskColors: Record<string, string> = { low: "text-success", med: "text-warning", high: "text-destructive" };

  const getTrend = (projectId: string, field: "momentum_score" | "sell_readiness_score"): "up" | "down" | "flat" => {
    const hist = historyMap.get(projectId)?.reverse();
    if (!hist || hist.length < 2) return "flat";
    const recent = hist[hist.length - 1][field];
    const prev = hist[hist.length - 2][field];
    if (recent > prev) return "up";
    if (recent < prev) return "down";
    return "flat";
  };

  const TrendIcon = ({ trend }: { trend: "up" | "down" | "flat" }) => {
    if (trend === "up") return <TrendingUp className="h-3 w-3 text-success" />;
    if (trend === "down") return <TrendingDown className="h-3 w-3 text-destructive" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  const activeProjects = projects.filter(p => p.status !== "completed");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Project Scores & Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 px-2">Project</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-center py-2 px-2">Momentum</th>
                <th className="text-center py-2 px-2">Risk</th>
                <th className="text-center py-2 px-2">Sell Ready</th>
                <th className="text-right py-2 px-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {activeProjects.map(p => {
                const s = scoreMap.get(p.id);
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{p.name}</td>
                    <td className="py-2 px-2">
                      <Badge variant="outline" className="text-[10px] capitalize">{p.status}</Badge>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1 justify-center">
                        <Progress value={s?.momentum_score ?? 0} className="h-1.5 w-12" />
                        <span>{s?.momentum_score ?? 0}</span>
                        <TrendIcon trend={getTrend(p.id, "momentum_score")} />
                      </div>
                    </td>
                    <td className={`py-2 px-2 text-center capitalize ${riskColors[s?.risk_level ?? "low"]}`}>
                      {s?.risk_level ?? "—"}
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1 justify-center">
                        <span className="font-mono">{s?.sell_readiness_score ?? "—"}</span>
                        <TrendIcon trend={getTrend(p.id, "sell_readiness_score")} />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right text-muted-foreground">
                      {format(new Date(p.updated_at), "MMM d")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
