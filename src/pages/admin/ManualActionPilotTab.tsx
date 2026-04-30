import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ShieldCheck, Lock, FlaskConical, Archive, RotateCcw, FileText } from "lucide-react";

// FORBIDDEN_UI_TOKENS: structural marker. This tab MUST NOT contain any of these
// labels as user-actionable buttons: Send, Reply, Email, WhatsApp, Push, Enrol,
// Enroll, Wake, Bulk, Dispatch. Verified by unit test src/test/step4w-manual-action.test.ts
export const FORBIDDEN_UI_TOKENS = [
  "Send","Reply","Email","WhatsApp","Push to CRM","Enrol","Enroll",
  "Wake Prospector","Start Phase 4A","Bulk","Dispatcher",
];

type Approval = {
  id: string;
  app_id: string;
  event_name: string | null;
  approval_type: string;
  approval_title: string;
  approval_summary: string;
  reviewed_by: string;
  second_reviewed_by: string;
  source_dry_run_id: string;
  source_proposal_id: string;
  expires_at: string | null;
};

type ActionRow = {
  id: string;
  created_at: string;
  source_approval_request_id: string;
  app_id: string;
  event_name: string | null;
  action_type: string;
  action_title: string;
  action_summary: string;
  admin_note: string | null;
  action_status: string;
  axis_a_snapshot: string;
  axis_b_snapshot: string;
  performed_by: string;
  reviewed_by: string;
  second_reviewed_by: string;
};

export default function ManualActionPilotTab() {
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, r] = await Promise.all([
        (supabase as any)
          .from("vos_approval_requests")
          .select("id, app_id, event_name, approval_type, approval_title, approval_summary, reviewed_by, second_reviewed_by, source_dry_run_id, source_proposal_id, expires_at")
          .eq("approval_status", "second_reviewed")
          .order("created_at", { ascending: false })
          .limit(50),
        (supabase as any)
          .from("vos_manual_action_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      setApprovals(a.data ?? []);
      setActions(r.data ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const recordNote = async (approvalId: string) => {
    setBusyId(approvalId);
    try {
      const { data, error } = await supabase.functions.invoke("vos-manual-action-recorder", {
        body: { source_approval_request_id: approvalId, admin_note: adminNote[approvalId] || null },
      });
      if (error) throw error;
      if ((data as any)?.duplicate_blocked) toast.info("Already recorded — duplicate blocked.");
      else toast.success("Internal admin note recorded. No external action taken.");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Recorder failed");
    } finally {
      setBusyId(null);
    }
  };

  const archiveAction = async (id: string) => {
    const { error } = await (supabase as any)
      .from("vos_manual_action_log")
      .update({ action_status: "archived" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Archived."); await load(); }
  };

  const recordRollback = async (id: string) => {
    const { error } = await (supabase as any)
      .from("vos_manual_action_log")
      .update({ action_status: "rollback_recorded", rollback_status: "rollback_recorded" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Rollback recorded."); await load(); }
  };

  const runTests = async () => {
    setTestBusy(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vos-step4w-test-runner", {});
      if (error) throw error;
      setTestResult(data);
      toast.success((data as any)?.verdict ?? "Tests complete.");
    } catch (e: any) {
      toast.error(e.message ?? "Test runner failed");
    } finally {
      setTestBusy(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="h-4 w-4" /> Manual Action Pilot — Internal Admin Note Only
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Axis A: RED</Badge>
            <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Axis B: OFF</Badge>
            <Badge variant="outline">No external calls</Badge>
            <Badge variant="outline">No customer-facing surface</Badge>
            <Badge variant="outline">No downstream writes</Badge>
          </div>
          <p className="text-muted-foreground">
            This tab records one harmless internal Vanto OS note per second-reviewed approval.
            It cannot send, reply, email, WhatsApp, push to CRM, enrol, wake, dispatch, or bulk-act.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Step 4W Verification</CardTitle>
          <Button size="sm" variant="outline" onClick={runTests} disabled={testBusy} className="gap-1">
            <FlaskConical className="h-4 w-4" /> {testBusy ? "Running…" : "Run Step 4W Test Suite"}
          </Button>
        </CardHeader>
        {testResult && (
          <CardContent>
            <div className="text-sm font-semibold mb-1">{testResult.verdict} — {testResult.score}</div>
          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-80">{JSON.stringify(testResult.assertions, null, 2)}</pre>
          {testResult.details && Object.keys(testResult.details).length > 0 && (
            <>
              <div className="text-xs font-semibold mt-3 mb-1 text-destructive">Setup / fixture details</div>
              <pre className="text-xs bg-destructive/5 border border-destructive/30 p-3 rounded overflow-auto max-h-80">{JSON.stringify(testResult.details, null, 2)}</pre>
            </>
          )}
        </CardContent>
      )}
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Eligible second-reviewed approvals</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {approvals.length === 0 && <p className="text-sm text-muted-foreground">No second-reviewed approvals available.</p>}
          {approvals.map((a) => {
            const alreadyRecorded = actions.some(r => r.source_approval_request_id === a.id);
            return (
              <div key={a.id} className="rounded border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-medium text-sm">{a.approval_title}</div>
                    <div className="text-xs text-muted-foreground">{a.app_id} · {a.event_name ?? "—"}</div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Badge variant="secondary">{a.approval_type}</Badge>
                    {alreadyRecorded && <Badge variant="outline">Already recorded</Badge>}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{a.approval_summary}</div>
                <Textarea
                  placeholder="Optional internal admin note (no banned wording, no PII, no instructions)."
                  value={adminNote[a.id] ?? ""}
                  onChange={(e) => setAdminNote((m) => ({ ...m, [a.id]: e.target.value }))}
                  rows={2}
                  className="text-xs"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => recordNote(a.id)}
                    disabled={busyId === a.id || alreadyRecorded}
                    className="gap-1"
                  >
                    <FileText className="h-4 w-4" />
                    {busyId === a.id ? "Recording…" : "Record internal admin note"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recorded internal notes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {actions.length === 0 && <p className="text-sm text-muted-foreground">No internal notes recorded.</p>}
          {actions.map((r) => (
            <div key={r.id} className="rounded border border-border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-medium">{r.action_title}</div>
                <div className="flex gap-1">
                  <Badge variant="outline">{r.action_status}</Badge>
                  <Badge variant="default">A:{r.axis_a_snapshot}</Badge>
                  <Badge variant="default">B:{r.axis_b_snapshot}</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{r.app_id} · {r.event_name ?? "—"} · {new Date(r.created_at).toLocaleString()}</div>
              <div className="text-xs">{r.action_summary}</div>
              {r.admin_note && <div className="text-xs italic text-muted-foreground">Note: {r.admin_note}</div>}
              <div className="text-[11px] font-mono text-muted-foreground break-all">
                approval={r.source_approval_request_id} · reviewers={r.reviewed_by.slice(0,8)}…/{r.second_reviewed_by.slice(0,8)}…
              </div>
              {r.action_status === "performed" && (
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" variant="outline" onClick={() => recordRollback(r.id)} className="gap-1">
                    <RotateCcw className="h-3 w-3" /> Record rollback
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => archiveAction(r.id)} className="gap-1">
                    <Archive className="h-3 w-3" /> Archive
                  </Button>
                </div>
              )}
              {r.action_status === "rollback_recorded" && (
                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="ghost" onClick={() => archiveAction(r.id)} className="gap-1">
                    <Archive className="h-3 w-3" /> Archive
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
