// Step 4Q — Inert Proposal Queue (admin tab, READ-ONLY + status transitions only)
// NO Approve. NO Execute. NO Send. NO Reply. NO Push. NO Replay. NO Bulk actions.
// Admin may only: Mark reviewed, Dismiss, Archive — and curator can be triggered.

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

type Proposal = {
  id: string;
  created_at: string;
  source_receipt_id: string | null;
  source_audit_id: string | null;
  app_id: string;
  event_name: string | null;
  intelligence_category: string;
  risk_level: string;
  proposal_type: string;
  proposal_title: string;
  proposal_summary: string;
  proposal_status: string;
  confidence: string;
  reason: string;
  safety_blocked: boolean;
  would_dispatch: boolean;
  dispatch_blocked: boolean;
  created_by_system: string;
  reviewed_at: string | null;
};

const RISK_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  info: "secondary", low: "secondary", medium: "outline",
  "medium-high": "outline", high: "destructive", unknown: "outline",
};

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  proposed: "default", reviewed: "secondary", dismissed: "outline", archived: "outline",
};

export default function ProposalQueueTab() {
  const [rows, setRows] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [curatorBusy, setCuratorBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const [fApp, setFApp] = useState("all");
  const [fEvent, setFEvent] = useState("all");
  const [fType, setFType] = useState("all");
  const [fRisk, setFRisk] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vos_proposal_queue" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows(((data ?? []) as unknown) as Proposal[]);
    } catch (e: any) {
      toast.error(`Failed to load proposals: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const apps = useMemo(() => Array.from(new Set(rows.map(r => r.app_id))).sort(), [rows]);
  const events = useMemo(() => Array.from(new Set(rows.map(r => r.event_name).filter(Boolean) as string[])).sort(), [rows]);
  const types = useMemo(() => Array.from(new Set(rows.map(r => r.proposal_type))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (fApp !== "all" && r.app_id !== fApp) return false;
      if (fEvent !== "all" && (r.event_name ?? "") !== fEvent) return false;
      if (fType !== "all" && r.proposal_type !== fType) return false;
      if (fRisk !== "all" && r.risk_level !== fRisk) return false;
      if (fStatus !== "all" && r.proposal_status !== fStatus) return false;
      if (s && !(`${r.proposal_title} ${r.proposal_summary}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [rows, fApp, fEvent, fType, fRisk, fStatus, search]);

  const runCurator = async () => {
    setCuratorBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("vos-proposal-curator", { body: {} });
      if (error) throw error;
      const ins = data?.summary?.proposals_inserted ?? 0;
      const dd = data?.summary?.skipped_dedupe ?? 0;
      toast.success(`Curator complete: ${ins} new, ${dd} deduped.`);
      await load();
    } catch (e: any) {
      toast.error(`Curator failed: ${e.message ?? e}`);
    } finally {
      setCuratorBusy(false);
    }
  };

  const runTests = async () => {
    setTestBusy(true); setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vos-step4q-test-runner", { body: {} });
      if (error) throw error;
      setTestResult(data);
      toast.success(data?.verdict ?? "Step 4Q tests complete.");
      await load();
    } catch (e: any) {
      toast.error(`Tests failed: ${e.message ?? e}`);
    } finally {
      setTestBusy(false);
    }
  };

  const updateStatus = async (id: string, next: "reviewed" | "dismissed" | "archived") => {
    const patch: any = { proposal_status: next };
    if (next === "reviewed") patch.reviewed_at = new Date().toISOString();
    const { error } = await supabase.from("vos_proposal_queue" as any).update(patch).eq("id", id);
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
            Proposal Queue
            <Badge variant="outline" className="ml-2">INERT</Badge>
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> NO DISPATCH</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Inert proposals derived from persisted receipts. Every row carries{" "}
            <code>would_dispatch=false</code>, <code>dispatch_blocked=true</code>,{" "}
            <code>safety_blocked=true</code>. No Approve / Execute / Send / Reply / Push / Replay
            controls exist by design.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={load} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Reload
            </Button>
            <Button onClick={runCurator} size="sm" disabled={curatorBusy}>
              <PlayCircle className={`h-4 w-4 mr-2 ${curatorBusy ? "animate-pulse" : ""}`} />
              Run Proposal Curator
            </Button>
            <Button onClick={runTests} variant="secondary" size="sm" disabled={testBusy}>
              <FlaskConical className={`h-4 w-4 mr-2 ${testBusy ? "animate-pulse" : ""}`} />
              Run Step 4Q Test Suite
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <Select value={fApp} onValueChange={setFApp}>
              <SelectTrigger><SelectValue placeholder="App" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All apps</SelectItem>
                {apps.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fEvent} onValueChange={setFEvent}>
              <SelectTrigger><SelectValue placeholder="Event" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All events</SelectItem>
                {events.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fType} onValueChange={setFType}>
              <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fRisk} onValueChange={setFRisk}>
              <SelectTrigger><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk</SelectItem>
                {["info","low","medium","medium-high","high","unknown"].map(r =>
                  <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {["proposed","reviewed","dismissed","archived"].map(s =>
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
            {filtered.length} of {rows.length} proposals
          </div>

          <div className="space-y-3">
            {filtered.map(r => (
              <Card key={r.id} className="border-l-4 border-l-primary/30">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={STATUS_VARIANT[r.proposal_status] ?? "outline"}>{r.proposal_status}</Badge>
                    <Badge variant="outline">{r.proposal_type}</Badge>
                    <Badge variant={RISK_VARIANT[r.risk_level] ?? "outline"}>risk: {r.risk_level}</Badge>
                    <Badge variant="secondary">conf: {r.confidence}</Badge>
                    <Badge variant="outline">{r.app_id}</Badge>
                    {r.event_name && <Badge variant="outline">{r.event_name}</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(r.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="font-medium">{r.proposal_title}</div>
                  <div className="text-sm text-muted-foreground">{r.proposal_summary}</div>
                  <div className="flex flex-wrap gap-1 text-xs">
                    <Badge variant="outline" className="font-mono">would_dispatch=false</Badge>
                    <Badge variant="outline" className="font-mono">dispatch_blocked=true</Badge>
                    <Badge variant="outline" className="font-mono">safety_blocked=true</Badge>
                    <Badge variant="outline" className="font-mono">category: {r.intelligence_category}</Badge>
                  </div>
                  {r.proposal_status === "proposed" && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="secondary" onClick={() => updateStatus(r.id, "reviewed")}>Mark reviewed</Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "dismissed")}>Dismiss</Button>
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "archived")}>Archive</Button>
                    </div>
                  )}
                  {(r.proposal_status === "reviewed" || r.proposal_status === "dismissed") && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, "archived")}>Archive</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No proposals match the current filters. Run the curator to scan persisted receipts.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
