import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ShieldCheck, FlaskConical, Lock } from "lucide-react";

// FORBIDDEN_UI_TOKENS: this tab is internal-only. No send/dispatch/publish/consume/
// external CRM write/WhatsApp/email/Zazi/APLGO/Master Prospector controls allowed.
export const FORBIDDEN_UI_TOKENS = [
  "Send","Dispatch","Publish","Consume","Axis unlock","External CRM write",
  "WhatsApp","Email","Zazi","APLGO","Master Prospector",
];

type Note = {
  id: string;
  created_at: string;
  note_status: string;
  note_kind: string;
  source_manual_action_id: string;
  source_approval_request_id: string;
  source_integration_draft_id: string;
  customer_visible: boolean;
  automation_safe: boolean;
  bulk_action: boolean;
  external_write_performed: boolean;
  axis_a_snapshot: string;
  axis_b_snapshot: string;
  dedupe_key: string;
  redaction_summary: any;
  archived_at: string | null;
  archive_reason: string | null;
};

type TestRow = { id: string; name: string; expected: string; actual: string; pass: boolean };
type TestReport = {
  ok: boolean;
  verdict: string;
  score: string;
  tests: TestRow[];
  invariants: Record<string, unknown>;
};

export default function CRMInternalNotesTab() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<TestReport | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vos_crm_internal_notes")
      .select(
        "id, created_at, note_status, note_kind, source_manual_action_id, source_approval_request_id, source_integration_draft_id, customer_visible, automation_safe, bulk_action, external_write_performed, axis_a_snapshot, axis_b_snapshot, dedupe_key, redaction_summary, archived_at, archive_reason"
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error("Failed to load CRM internal notes", { description: error.message });
      setNotes([]);
    } else {
      setNotes((data ?? []) as Note[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const runSuite = async () => {
    setRunning(true);
    setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("vos-step5b-test-runner", {
        body: {},
      });
      if (error) throw error;
      setReport(data as TestReport);
      const ok = (data as TestReport)?.verdict?.includes("COMPLETE");
      if (ok) toast.success("Step 5B suite passed", { description: (data as TestReport).score });
      else toast.error("Step 5B suite incomplete", { description: (data as TestReport).verdict });
      await load();
    } catch (e: any) {
      toast.error("Test runner error", { description: e?.message ?? String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-2 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            CRM Internal Notes — Audit Surface
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Internal-only audit trail of CRM notes recorded by the Step 5B controller. Every row is
            customer-invisible, automation-safe, axis-locked, and PII-redacted. No external CRM
            write is ever performed from this surface.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Axis A: RED</Badge>
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Axis B: OFF</Badge>
            <Badge variant="outline">Axis C: INTERNAL ONLY</Badge>
            <Badge variant="outline">Axis D: ASLEEP</Badge>
          </div>
          <div>
            <Button onClick={runSuite} disabled={running} className="gap-2">
              <FlaskConical className="h-4 w-4" />
              {running ? "Running…" : "Run Step 5B Test Suite"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Test Result
              <Badge variant={report.verdict.includes("COMPLETE") ? "default" : "destructive"}>
                {report.score}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm font-medium">{report.verdict}</div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">ID</th>
                    <th className="px-2 py-1.5 text-left">Name</th>
                    <th className="px-2 py-1.5 text-left">Expected</th>
                    <th className="px-2 py-1.5 text-left">Actual</th>
                    <th className="px-2 py-1.5 text-left">Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tests.map((t) => (
                    <tr key={t.id + t.name} className="border-t">
                      <td className="px-2 py-1.5 font-mono">{t.id}</td>
                      <td className="px-2 py-1.5">{t.name}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{t.expected}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{t.actual}</td>
                      <td className="px-2 py-1.5">
                        <Badge variant={t.pass ? "default" : "destructive"}>
                          {t.pass ? "PASS" : "FAIL"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Invariants</div>
              <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">
                {JSON.stringify(report.invariants, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Latest Internal Notes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !notes || notes.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No internal notes recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">created_at</th>
                    <th className="px-2 py-1.5 text-left">status</th>
                    <th className="px-2 py-1.5 text-left">kind</th>
                    <th className="px-2 py-1.5 text-left">manual_action</th>
                    <th className="px-2 py-1.5 text-left">approval</th>
                    <th className="px-2 py-1.5 text-left">draft</th>
                    <th className="px-2 py-1.5 text-left">cust_vis</th>
                    <th className="px-2 py-1.5 text-left">auto_safe</th>
                    <th className="px-2 py-1.5 text-left">bulk</th>
                    <th className="px-2 py-1.5 text-left">ext_write</th>
                    <th className="px-2 py-1.5 text-left">axis_a</th>
                    <th className="px-2 py-1.5 text-left">axis_b</th>
                    <th className="px-2 py-1.5 text-left">dedupe</th>
                    <th className="px-2 py-1.5 text-left">redaction</th>
                    <th className="px-2 py-1.5 text-left">archived_at</th>
                    <th className="px-2 py-1.5 text-left">archive_reason</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((n) => (
                    <tr key={n.id} className="border-t align-top">
                      <td className="px-2 py-1.5 whitespace-nowrap">{new Date(n.created_at).toLocaleString()}</td>
                      <td className="px-2 py-1.5"><Badge variant="outline">{n.note_status}</Badge></td>
                      <td className="px-2 py-1.5">{n.note_kind}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px]">{n.source_manual_action_id?.slice(0, 8)}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px]">{n.source_approval_request_id?.slice(0, 8)}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px]">{n.source_integration_draft_id?.slice(0, 8)}</td>
                      <td className="px-2 py-1.5">{String(n.customer_visible)}</td>
                      <td className="px-2 py-1.5">{String(n.automation_safe)}</td>
                      <td className="px-2 py-1.5">{String(n.bulk_action)}</td>
                      <td className="px-2 py-1.5">{String(n.external_write_performed)}</td>
                      <td className="px-2 py-1.5">{n.axis_a_snapshot}</td>
                      <td className="px-2 py-1.5">{n.axis_b_snapshot}</td>
                      <td className="px-2 py-1.5 font-mono text-[10px]">{n.dedupe_key?.slice(0, 12)}…</td>
                      <td className="px-2 py-1.5 font-mono text-[10px]">{JSON.stringify(n.redaction_summary)}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{n.archived_at ? new Date(n.archived_at).toLocaleString() : "—"}</td>
                      <td className="px-2 py-1.5">{n.archive_reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
