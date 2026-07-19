import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, RefreshCw, Power, PowerOff, History } from "lucide-react";
import { toast } from "sonner";

// Phase C+D+F: Suite Overview
// - Health tab: last N telemetry probes per spoke (uptime %, avg latency)
// - Lifecycle tab: activate/deactivate spokes, view lifecycle audit trail
// - Consolidated single-pane governance view

type App = {
  id: string;
  app_key: string;
  name: string;
  url: string;
  role: string;
  is_active: boolean;
  bridge_secret_slot: string;
};
type Telemetry = {
  id: string;
  app_key: string;
  probed_at: string;
  ok: boolean;
  http_status: number | null;
  latency_ms: number | null;
  error: string | null;
};
type Lifecycle = {
  id: string;
  app_key: string;
  action: string;
  actor_user_id: string | null;
  detail: any;
  created_at: string;
};

export default function SuiteOverviewTab() {
  const [apps, setApps] = useState<App[]>([]);
  const [tel, setTel] = useState<Telemetry[]>([]);
  const [life, setLife] = useState<Lifecycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  async function load() {
    setLoading(true);
    const [a, t, l] = await Promise.all([
      supabase.from("vos_suite_apps").select("*").order("app_key"),
      supabase.from("vos_suite_telemetry").select("*").order("probed_at", { ascending: false }).limit(500),
      supabase.from("vos_spoke_lifecycle_log").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setApps((a.data as App[]) ?? []);
    setTel((t.data as Telemetry[]) ?? []);
    setLife((l.data as Lifecycle[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function runHealthPoll() {
    setPolling(true);
    const { data, error } = await supabase.functions.invoke("suite-bridge-hub", {
      body: { action: "health_poll" },
    });
    setPolling(false);
    if (error) { toast.error(error.message); return; }
    const probed = (data as any)?.probed ?? [];
    const okCount = probed.filter((r: any) => r.ok).length;
    toast.success(`Health poll: ${okCount}/${probed.length} spokes healthy`);
    load();
  }

  async function toggleActive(app: App) {
    const newState = !app.is_active;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("vos_suite_apps")
      .update({ is_active: newState }).eq("app_key", app.app_key);
    if (error) { toast.error(error.message); return; }
    await supabase.from("vos_spoke_lifecycle_log").insert({
      app_key: app.app_key,
      action: newState ? "activate" : "deactivate",
      actor_user_id: user?.id,
      detail: { previous: app.is_active, next: newState },
    });
    toast.success(`${app.name}: ${newState ? "activated" : "deactivated"}`);
    load();
  }

  // Aggregate uptime + avg latency per spoke (last 50 probes)
  const health = useMemo(() => {
    const byApp: Record<string, Telemetry[]> = {};
    for (const row of tel) {
      (byApp[row.app_key] ??= []).push(row);
    }
    return apps.filter(a => a.role === "spoke").map(app => {
      const rows = (byApp[app.app_key] ?? []).slice(0, 50);
      const total = rows.length;
      const okN = rows.filter(r => r.ok).length;
      const latencies = rows.filter(r => r.latency_ms != null).map(r => r.latency_ms!);
      const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
      const last = rows[0] ?? null;
      return {
        app,
        total,
        uptime: total ? Math.round((okN / total) * 100) : null,
        avgLatency: avg,
        last,
      };
    });
  }, [apps, tel]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Suite Overview
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Single-pane governance view for the United Brain — spoke health, lifecycle, and audit trail.
          </p>
        </CardHeader>
      </Card>

      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="lifecycle">Lifecycle</TabsTrigger>
          <TabsTrigger value="audit">Audit ({life.length})</TabsTrigger>
        </TabsList>

        {/* --- Health --- */}
        <TabsContent value="health" className="pt-4 space-y-3">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button size="sm" onClick={runHealthPoll} disabled={polling}>
              <Activity className={`mr-2 h-4 w-4 ${polling ? "animate-pulse" : ""}`} />
              {polling ? "Probing…" : "Run health poll"}
            </Button>
          </div>
          {health.length === 0 && (
            <p className="text-sm text-muted-foreground">No spokes registered.</p>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {health.map(({ app, total, uptime, avgLatency, last }) => (
              <Card key={app.app_key}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{app.name}</CardTitle>
                    <Badge variant={app.is_active ? "default" : "outline"}>
                      {app.is_active ? "active" : "inactive"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{app.app_key}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Uptime (last {total || 0})</span>
                    <span className="font-medium">
                      {uptime == null ? "—" : `${uptime}%`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Avg latency</span>
                    <span className="font-medium">{avgLatency == null ? "—" : `${avgLatency} ms`}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last probe</span>
                    <span className="font-medium">
                      {last ? (
                        <>
                          {new Date(last.probed_at).toLocaleTimeString()}{" "}
                          <Badge variant={last.ok ? "default" : "destructive"} className="ml-1">
                            {last.ok ? "OK" : last.error ?? "fail"}
                          </Badge>
                        </>
                      ) : "never"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* --- Lifecycle --- */}
        <TabsContent value="lifecycle" className="pt-4 space-y-3">
          {apps.length === 0 && <p className="text-sm text-muted-foreground">No apps in registry.</p>}
          {apps.map(app => (
            <Card key={app.app_key}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{app.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {app.app_key} · {app.role} · <span className="font-mono">{app.url}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={app.is_active ? "default" : "outline"}>
                      {app.is_active ? "active" : "inactive"}
                    </Badge>
                    {app.role === "spoke" && (
                      <Button size="sm" variant={app.is_active ? "outline" : "default"} onClick={() => toggleActive(app)}>
                        {app.is_active ? (
                          <><PowerOff className="mr-2 h-4 w-4" /> Deactivate</>
                        ) : (
                          <><Power className="mr-2 h-4 w-4" /> Activate</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Secret slot: <span className="font-mono">{app.bridge_secret_slot}</span>
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* --- Audit --- */}
        <TabsContent value="audit" className="pt-4 space-y-2">
          {life.length === 0 && <p className="text-sm text-muted-foreground">No lifecycle events yet.</p>}
          {life.map(row => (
            <div key={row.id} className="flex items-center justify-between rounded border p-2 text-sm">
              <div className="flex items-center gap-2">
                <History className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{row.app_key}</span>
                <Badge variant="outline">{row.action}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
