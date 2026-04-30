// Step 4S — Dry-Run Actions (admin tab, READ-ONLY + status transitions only)
// NO Approve. NO Execute. NO Send. NO Reply. NO Push. NO Replay. NO Bulk actions.
// Admin may only: Mark reviewed, Dismiss, Archive — and engine can be triggered.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw, ShieldCheck, PlayCircle, FlaskConical, Lock } from "lucide-react";
import { toast } from "sonner";

type DryRun = {
  id: string;
  created_at: string;
  source_proposal_id: string;
  app_id: string;
  event_name: string | null;
  dry_run_type: string;
  dry_run_title: string;
  dry_run_summary: string;
  simulated_target: string;
  simulated_payload_redacted: any;
  would_execute: boolean;
  execution_blocked: boolean;
  dispatch_blocked: boolean;
  safety_blocked: boolean;
  dry_run_status: string;
  created_by_system: string;
  reviewed_at: string | null;
};

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  generated: "default", reviewed: "secondary", dismissed: "outline", archived: "outline",
};

export default function DryRunActionsTab() {
  const [rows, setRows] = useState<DryRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [engineBusy, setEngineBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const [fApp, setFApp] = useState("all");
  const [fType, setFType] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vos_dry_run_actions" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows(((data ?? []) as unknown) as DryRun[]);
    } catch (e: any) {
      toast.error(`Failed to load dry-runs: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const apps = useMemo(() => Array.from(new Set(rows.map(r => r.app_id))).sort(), [rows]);
  const types = useMemo(() => Array.from(new Set(rows.map(r => r.dry_run_type))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (fApp !== "all" && r.app_id !== fApp) return false;
      if (fType !== "all" && r.dry_run_type !== fType) return false;
      if (fStatus !== "all" && r.dry_run_status !== fStatus) return false;
      if (s && !(`${r.dry_run_title} ${r.dry_run_summary}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [rows, fApp, fType, fStatus, search]);

  const runEngine = async () => {
    setEngineBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("vos-dry-run-engine", { body: {} });
      if (error) throw error;
      const ins = data?.summary?.dry_runs_inserted ?? 0;
      const dd = data?.summary?.skipped_dedupe ?? 0;
      toast.success(`Dry-run engine complete: ${ins} new, ${dd} deduped.`);
      await load();
    } catch (e: any) {
      toast.error(`Engine failed: ${e.message ?? e}`);
    } finally {
      setEngineBusy(false);
    }
  };

  const runTests = async () => {
    setTestBusy(true); setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vos-step4s-test-runner", { body: {} });
      if (error) throw error;
      setTestResult(data);
      toast.success(data?.verdict ?? "Step 4S tests complete.");
      await load();
    } catch (e: any) {
      toast.error(`Tests failed: ${e.message ?? e}`);
    } finally {
      setTestBusy(false);
    }
  };

  const updateStatus = async (id: string, next: "reviewed" | "dismissed" | "archived") => {
    const patch: any = { dry_run_status: next };
    if (next === "reviewed") {
      patch.reviewed_at = new Date().toISOString();
      const { data: u } = await supabase.auth.getUser();
      if (u?.user?.id) patch.reviewed_by = u.user.id;
    }
    const { error } = await supabase.from("vos_dry_run_actions" as any).update(patch).eq("id", id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    toast.success(`Marked ${next}.`);
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Dry-Run Actions
            <Badge variant="outline" className="ml-2">SIMULATION ONLY</Badge>
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> NO EXECUTION</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Simulated previews derived from inert proposals. Every row carries{" "}
            <code>would_execute=false</code>, <code>execution_blocked=true</code>,{" "}
            <code>dispatch_blocked=true</code>, <code>safety_blocked=true</code>. No Approve /
            Execute / Send / Reply / Push / Enrol / Dispatch / Bulk controls exist by design.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={load} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Reload
            </Button>
            <Button onClick={runEngine} size="sm" disabled={engineBusy}>
              <PlayCircle className={`h-4 w-4 mr-2 ${engineBusy ? "animate-pulse" : ""}`} />
              Run Dry-Run Engine
            </Button>
            <Button onClick={runTests} variant="secondary" size="sm" disabled={testBusy}>
              <FlaskConical className={`h-4 w-4 mr-2 ${testBusy ? "animate-pulse" : ""}`} />
              Run Step 4S Test Suite
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Select value={fApp} onValueChange={setFApp}>
              <SelectTrigger><SelectValue placeholder="App" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All apps</SelectItem>
                {apps.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {["generated","reviewed","dismissed","archived"].map(s =>
                  <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Search title/summary" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {testResult && (
            <Card className="bg-muted/30">
              <CardHeader><CardTitle className="text-base">Test Result</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-mono mb-2">{testResult.verdict}</div>
                <pre className="text-xs overflow-auto max-h-64 bg-background p-2 rounded">
{JSON.stringify(testResult.assertions, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          <div className="text-sm text-muted-foreground">
            {filtered.length} of {rows.length} dry-runs
          </div>

          <div className="space-y-3">
            {filtered.map(r => (
              <Card key={r.id} className="border-l-4 border-l-primary/30">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.dry_run_status] ?? "outline"}>{r.dry_run_status}</Badge>
                    <Badge variant="outline">{r.dry_run_type}</Badge>
                    <Badge variant="outline">{r.app_id}</Badge>
                    {r.event_name && <Badge variant="outline">{r.event_name}</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="font-medium">{r.dry_run_title}</div>
                  <div className="text-sm text-muted-foreground">{r.dry_run_summary}</div>
                  <div className="text-xs text-muted-foreground">
                    Simulated target: <code className="font-mono">{r.simulated_target}</code>
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs">
                    <Badge variant="outline" className="font-mono">would_execute=false</Badge>
                    <Badge variant="outline" className="font-mono">execution_blocked=true</Badge>
                    <Badge variant="outline" className="font-mono">dispatch_blocked=true</Badge>
                    <Badge variant="outline" className="font-mono">safety_blocked=true</Badge>
                  </div>
                  {r.dry_run_status === "generated" && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="secondary" onClick={() => updateStatus(r.id, "reviewed")}>Mark reviewed</Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "dismissed")}>Dismiss</Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "archived")}>Archive</Button>
                    </div>
                  )}
                  {(r.dry_run_status === "reviewed" || r.dry_run_status === "dismissed") && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "archived")}>Archive</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No dry-runs match the current filters. Run the engine to generate previews from existing proposals.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
