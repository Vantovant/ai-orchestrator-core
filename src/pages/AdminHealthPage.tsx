import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, RefreshCw, Shield, Mic, FileSpreadsheet, Cpu } from "lucide-react";
import { toast } from "sonner";

interface HealthMetrics {
  ai_providers: Record<string, number>;
  ai_statuses: Record<string, number>;
  voice_empty_rate: number;
  voice_total: number;
  import_statuses: Record<string, number>;
  import_types: Record<string, number>;
  top_failures: string[];
  total_runs: number;
}

export default function AdminHealthPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("admin-health");
      if (fnError) throw fnError;
      if (data.error) { setError(data.error); return; }
      setMetrics(data);
    } catch (e: any) {
      setError(e.message || "Failed to load metrics");
      toast.error("Access denied or failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMetrics(); }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <Shield className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-lg font-bold">Access Denied</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6" /> System Health</h1>
          <p className="text-sm text-muted-foreground">Aggregated metrics — no sensitive data</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchMetrics} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-40" />)}</div>
      ) : metrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* AI Provider Usage */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" /> AI Provider Usage</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">Total runs: {metrics.total_runs}</p>
              {Object.entries(metrics.ai_providers).map(([provider, count]) => (
                <div key={provider} className="flex justify-between text-sm">
                  <span>{provider}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {Object.keys(metrics.ai_providers).length === 0 && <p className="text-xs text-muted-foreground">No data yet</p>}
            </CardContent>
          </Card>

          {/* AI Status Distribution */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> AI Status Distribution</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(metrics.ai_statuses).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm">
                  <Badge variant={status === "ok" ? "default" : status === "error" ? "destructive" : "secondary"}>{status}</Badge>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(metrics.ai_statuses).length === 0 && <p className="text-xs text-muted-foreground">No data yet</p>}
            </CardContent>
          </Card>

          {/* Voice Stats */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Mic className="h-4 w-4 text-primary" /> Voice Transcript Stats</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total transcripts</span><span className="font-medium">{metrics.voice_total}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Empty rate</span><span className="font-medium">{(metrics.voice_empty_rate * 100).toFixed(1)}%</span></div>
            </CardContent>
          </Card>

          {/* Bank Import Status */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-primary" /> Import Status Counts</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(metrics.import_statuses).map(([status, count]) => (
                <div key={status} className="flex justify-between text-sm">
                  <Badge variant={status === "review" ? "default" : status === "failed" ? "destructive" : "secondary"}>{status}</Badge>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(metrics.import_statuses).length === 0 && <p className="text-xs text-muted-foreground">No imports yet</p>}
            </CardContent>
          </Card>

          {/* Import by Type */}
          <Card>
            <CardHeader><CardTitle className="text-base">Import by File Type</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(metrics.import_types).map(([type, count]) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="uppercase">{type}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Top Failures */}
          <Card>
            <CardHeader><CardTitle className="text-base">Top Failure Reasons</CardTitle></CardHeader>
            <CardContent>
              {metrics.top_failures.length === 0 ? (
                <p className="text-xs text-muted-foreground">No failures recorded 🎉</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {metrics.top_failures.map((reason, i) => (
                    <li key={i} className="text-muted-foreground truncate">• {reason}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
