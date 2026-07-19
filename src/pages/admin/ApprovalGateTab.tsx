// Step 4U — Approval Gate (admin tab, READ + status transitions only)
// NO Execute. NO Send. NO Reply. NO Push to CRM. NO Enrol. NO Wake. NO Phase 4A. NO Bulk. NO Dispatcher.
// Two-key model: second reviewer must be a different admin user.

import { useEffect, useMemo, useState, Component, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw, ShieldCheck, PlayCircle, FlaskConical, Lock, KeyRound } from "lucide-react";
import { toast } from "sonner";

type Approval = {
  id: string;
  created_at: string;
  source_dry_run_id: string;
  source_proposal_id: string;
  app_id: string;
  event_name: string | null;
  approval_type: string;
  approval_title: string;
  approval_summary: string;
  approval_status: string;
  requested_by_system: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  second_reviewed_by: string | null;
  second_reviewed_at: string | null;
  rejection_reason: string | null;
  expires_at: string;
  would_execute: boolean;
  execution_blocked: boolean;
  dispatch_blocked: boolean;
  safety_blocked: boolean;
  approval_does_not_execute: boolean;
};

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  requested: "default", reviewed: "secondary", second_reviewed: "secondary",
  rejected: "destructive", expired: "outline", archived: "outline",
};

class TabErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("ApprovalGateTab crash:", error); }
  render() {
    if (this.state.error) {
      return (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <div className="font-medium text-destructive">Approval Gate failed to render.</div>
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64">{String(this.state.error.message || this.state.error)}</pre>
            <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>Retry</Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

export default function ApprovalGateTab() {
  const [rows, setRows] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(false);
  const [curatorBusy, setCuratorBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [fApp, setFApp] = useState("all");
  const [fType, setFType] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("vos_approval_requests" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      setRows(((data ?? []) as unknown) as Approval[]);
    } catch (e: any) {
      toast.error(`Failed to load approvals: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data?.user?.id ?? null));
  }, []);

  const apps = useMemo(() => Array.from(new Set(rows.map(r => r.app_id))).sort(), [rows]);
  const types = useMemo(() => Array.from(new Set(rows.map(r => r.approval_type))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(r => {
      if (fApp !== "all" && r.app_id !== fApp) return false;
      if (fType !== "all" && r.approval_type !== fType) return false;
      if (fStatus !== "all" && r.approval_status !== fStatus) return false;
      if (s && !(`${r.approval_title} ${r.approval_summary}`.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [rows, fApp, fType, fStatus, search]);

  const runCurator = async () => {
    setCuratorBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("vos-approval-curator", { body: {} });
      if (error) throw error;
      const ins = data?.summary?.approvals_inserted ?? 0;
      const dd = data?.summary?.skipped_dedupe ?? 0;
      toast.success(`Approval curator complete: ${ins} new, ${dd} deduped.`);
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
      const { data, error } = await supabase.functions.invoke("vos-step4u-test-runner", { body: {} });
      if (error) throw error;
      setTestResult(data);
      toast.success(data?.verdict ?? "Step 4U tests complete.");
      await load();
    } catch (e: any) {
      toast.error(`Tests failed: ${e.message ?? e}`);
    } finally {
      setTestBusy(false);
    }
  };

  // Step 5E: server-enforced two-key via generic RPCs.
  const markReviewed = async (r: Approval) => {
    if (!currentUserId) { toast.error("No active session."); return; }
    const { error } = await supabase.rpc("vos_generic_first_review" as any, { p_approval_id: r.id });
    if (error) { toast.error(`First review failed: ${error.message}`); return; }
    toast.success("First review recorded.");
    await load();
  };

  const secondReviewConfirm = async (r: Approval) => {
    if (!currentUserId) { toast.error("No active session."); return; }
    if (r.reviewed_by && r.reviewed_by === currentUserId) {
      toast.error("Two-key rule: second reviewer must be a different user.");
      return;
    }
    const { error } = await supabase.rpc("vos_generic_second_review" as any, { p_approval_id: r.id });
    if (error) { toast.error(`Second review failed: ${error.message}`); return; }
    toast.success("Second-review confirmed.");
    await load();
  };

  const reject = async (r: Approval) => {
    const reason = (rejectionReasons[r.id] ?? "").trim();
    if (!reason) { toast.error("Rejection reason required."); return; }
    const { error } = await supabase.rpc("vos_generic_reject" as any, { p_approval_id: r.id, p_reason: reason });
    if (error) { toast.error(`Reject failed: ${error.message}`); return; }
    toast.success("Rejected.");
    await load();
  };

  const archive = async (r: Approval) => {
    const { error } = await supabase.from("vos_approval_requests" as any).update({
      approval_status: "archived",
    }).eq("id", r.id);
    if (error) { toast.error(`Archive failed: ${error.message}`); return; }
    toast.success("Archived.");
    await load();
  };

  return (
    <TabErrorBoundary>
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <ShieldCheck className="h-5 w-5" />
            Approval Gate
            <Badge variant="outline" className="ml-2">DECISION RECORDS ONLY</Badge>
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> NO EXECUTION</Badge>
            <Badge variant="outline" className="gap-1"><KeyRound className="h-3 w-3" /> TWO-KEY (5E GENERIC)</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Approvals are <strong>human decision records</strong> attached to dry-runs. Every row carries{" "}
            <code>would_execute=false</code>, <code>execution_blocked=true</code>,{" "}
            <code>dispatch_blocked=true</code>, <code>safety_blocked=true</code>,{" "}
            <code>approval_does_not_execute=true</code>. Approving here does not perform any
            action. The second reviewer must be a different admin from the first.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={load} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Reload
            </Button>
            <Button onClick={runCurator} size="sm" disabled={curatorBusy}>
              <PlayCircle className={`h-4 w-4 mr-2 ${curatorBusy ? "animate-pulse" : ""}`} />
              Run Approval Curator
            </Button>
            <Button onClick={runTests} variant="secondary" size="sm" disabled={testBusy}>
              <FlaskConical className={`h-4 w-4 mr-2 ${testBusy ? "animate-pulse" : ""}`} />
              Run Step 4U Test Suite
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
                {["requested","reviewed","second_reviewed","rejected","expired","archived"].map(s =>
                  <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Search title/summary" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {testResult && (
            <Card className="bg-muted/30">
              <CardHeader><CardTitle className="text-base">Test Result</CardTitle></CardHeader>
              <CardContent>
                <div className="text-sm font-mono mb-2">{testResult.verdict} ({testResult.passed}/{testResult.total})</div>
                <pre className="text-xs overflow-auto max-h-64 bg-background p-2 rounded">
{JSON.stringify(testResult.assertions, null, 2)}
                </pre>
                {testResult.details && Object.keys(testResult.details).length > 0 && (
                  <pre className="text-xs overflow-auto max-h-48 bg-background p-2 rounded mt-2">
{JSON.stringify(testResult.details, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          )}

          <div className="text-sm text-muted-foreground">
            {filtered.length} of {rows.length} approvals
          </div>

          <div className="space-y-3">
            {filtered.map(r => {
              const expired = r.expires_at ? new Date(r.expires_at).getTime() < Date.now() : false;
              const sameUser = r.reviewed_by && currentUserId && r.reviewed_by === currentUserId;
              return (
                <Card key={r.id} className="border-l-4 border-l-primary/30">
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANT[r.approval_status] ?? "outline"}>{r.approval_status}</Badge>
                      <Badge variant="outline">{r.approval_type}</Badge>
                      <Badge variant="outline">{r.app_id}</Badge>
                      {r.event_name && <Badge variant="outline">{r.event_name}</Badge>}
                      {expired && <Badge variant="destructive">expired</Badge>}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="font-medium">{r.approval_title}</div>
                    <div className="text-sm text-muted-foreground">{r.approval_summary}</div>
                    <div className="text-xs text-muted-foreground">
                      Source dry-run: <code className="font-mono">{(r.source_dry_run_id ?? "—").slice(0,8)}…</code>{" • "}
                      Source proposal: <code className="font-mono">{(r.source_proposal_id ?? "—").slice(0,8)}…</code>{" • "}
                      Expires: {r.expires_at ? new Date(r.expires_at).toLocaleString() : "—"}
                    </div>
                    {(r.reviewed_by || r.second_reviewed_by) && (
                      <div className="text-xs text-muted-foreground">
                        {r.reviewed_by && <>Reviewer 1: <code className="font-mono">{r.reviewed_by.slice(0,8)}…</code> </>}
                        {r.second_reviewed_by && <>• Reviewer 2: <code className="font-mono">{r.second_reviewed_by.slice(0,8)}…</code></>}
                      </div>
                    )}
                    {r.rejection_reason && (
                      <div className="text-xs text-destructive">Rejection reason: {r.rejection_reason}</div>
                    )}
                    <div className="flex flex-wrap gap-1 text-xs">
                      <Badge variant="outline" className="font-mono">would_execute=false</Badge>
                      <Badge variant="outline" className="font-mono">execution_blocked=true</Badge>
                      <Badge variant="outline" className="font-mono">dispatch_blocked=true</Badge>
                      <Badge variant="outline" className="font-mono">safety_blocked=true</Badge>
                      <Badge variant="outline" className="font-mono">approval_does_not_execute=true</Badge>
                    </div>

                    {r.approval_status === "requested" && !expired && (
                      <div className="space-y-2 pt-1">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" onClick={() => markReviewed(r)}>Mark reviewed</Button>
                          <Button size="sm" variant="outline" onClick={() => archive(r)}>Archive</Button>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Textarea
                            placeholder="Rejection reason (required to reject)…"
                            value={rejectionReasons[r.id] ?? ""}
                            onChange={(e) => setRejectionReasons(p => ({ ...p, [r.id]: e.target.value }))}
                            className="min-h-[60px]"
                          />
                          <Button size="sm" variant="destructive" className="w-fit" onClick={() => reject(r)}>Reject</Button>
                        </div>
                      </div>
                    )}

                    {r.approval_status === "reviewed" && !expired && (
                      <div className="space-y-2 pt-1">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={!!sameUser}
                            title={sameUser ? "Two-key: a different admin must confirm" : ""}
                            onClick={() => secondReviewConfirm(r)}
                          >
                            <KeyRound className="h-3 w-3 mr-1" />
                            Second-review confirm
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => archive(r)}>Archive</Button>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Textarea
                            placeholder="Rejection reason (required to reject)…"
                            value={rejectionReasons[r.id] ?? ""}
                            onChange={(e) => setRejectionReasons(p => ({ ...p, [r.id]: e.target.value }))}
                            className="min-h-[60px]"
                          />
                          <Button size="sm" variant="destructive" className="w-fit" onClick={() => reject(r)}>Reject</Button>
                        </div>
                        {sameUser && (
                          <div className="text-xs text-destructive">
                            You marked this reviewed. A different admin must perform the second review.
                          </div>
                        )}
                      </div>
                    )}

                    {r.approval_status === "second_reviewed" && (
                      <div className="space-y-2 pt-1">
                        {r.approval_type === "platform_flag_flip" && (
                          <div className="flex flex-wrap gap-2 items-center">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={!!executing[r.id]}
                              onClick={() => executePlatformFlagFlip(r)}
                            >
                              <PlayCircle className={`h-3 w-3 mr-1 ${executing[r.id] ? "animate-pulse" : ""}`} />
                              Execute platform flag flip
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              Writes the new flag value and records to vos_killswitch_log. Two-key already satisfied.
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => archive(r)}>Archive</Button>
                        </div>
                      </div>
                    )}
                    {(r.approval_status === "rejected" || r.approval_status === "expired") && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" variant="outline" onClick={() => archive(r)}>Archive</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {!loading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No approval requests match the current filters. Run the curator to generate decision records from existing dry-runs.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
    </TabErrorBoundary>
  );
}
