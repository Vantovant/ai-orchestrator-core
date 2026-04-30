import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ShieldCheck, Lock, FlaskConical, Archive, FileText, Eye } from "lucide-react";

// FORBIDDEN_UI_TOKENS: structural marker. This tab MUST NOT contain any of these
// labels as user-actionable buttons: Send, Reply, Email, WhatsApp, Push, Enrol,
// Enroll, Wake, Bulk, Dispatch, Live write. Verified by unit test.
export const FORBIDDEN_UI_TOKENS = [
  "Send","Reply","Email","WhatsApp","Push to CRM","Enrol","Enroll",
  "Wake Prospector","Start Phase 4A","Bulk","Dispatcher","Live write","Execute live",
];

type ManualAction = {
  id: string;
  app_id: string;
  event_name: string | null;
  action_title: string;
  action_summary: string;
  action_status: string;
  axis_a_snapshot: string;
  axis_b_snapshot: string;
  source_approval_request_id: string;
};

type Draft = {
  id: string;
  created_at: string;
  source_manual_action_id: string;
  target_app: string;
  target_surface: string;
  integration_action_type: string;
  draft_title: string;
  draft_summary: string;
  draft_status: string;
  would_write_external: boolean;
  external_write_blocked: boolean;
  customer_visible: boolean;
  bulk_action: boolean;
  rollback_required: boolean;
};

const TARGETS: Array<{ key: "crm"|"zazi_mail"|"aplgo"; label: string; type: string }> = [
  { key: "crm", label: "CRM internal note", type: "crm_note_draft_internal" },
  { key: "zazi_mail", label: "Zazi Mail internal tag", type: "zazi_tag_draft_internal" },
  { key: "aplgo", label: "APLGO interest note", type: "aplgo_interest_note_draft_internal" },
];

export default function IntegrationDraftsTab() {
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<ManualAction[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draftNote, setDraftNote] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all"|"crm"|"zazi_mail"|"aplgo">("all");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, d] = await Promise.all([
        (supabase as any)
          .from("vos_manual_action_log")
          .select("id, app_id, event_name, action_title, action_summary, action_status, axis_a_snapshot, axis_b_snapshot, source_approval_request_id")
          .eq("action_status", "performed")
          .order("created_at", { ascending: false })
          .limit(50),
        (supabase as any)
          .from("vos_integration_action_drafts")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      setActions(a.data ?? []);
      setDrafts(d.data ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visibleDrafts = useMemo(() => {
    if (filter === "all") return drafts;
    return drafts.filter(d => d.target_app === filter);
  }, [drafts, filter]);

  const recordDraft = async (manualActionId: string, target_app: string, integration_action_type: string) => {
    const key = `${manualActionId}:${target_app}:${integration_action_type}`;
    setBusyKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("vos-integration-draft-recorder", {
        body: {
          source_manual_action_id: manualActionId,
          target_app,
          integration_action_type,
          draft_note: draftNote[key] || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.duplicate_blocked) toast.info("Already drafted — duplicate blocked.");
      else toast.success("Internal integration draft recorded. No external write performed.");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Draft recorder failed");
    } finally {
      setBusyKey(null);
    }
  };

  const updateStatus = async (id: string, draft_status: "reviewed"|"dismissed"|"archived") => {
    const { error } = await (supabase as any)
      .from("vos_integration_action_drafts")
      .update({ draft_status, reviewed_at: draft_status === "reviewed" ? new Date().toISOString() : undefined })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(`Draft ${draft_status}.`); await load(); }
  };

  const runTests = async () => {
    setTestBusy(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("vos-step4y-test-runner", {});
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
            <Lock className="h-4 w-4" /> Integration Drafts — Internal Only
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Axis A: RED</Badge>
            <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" /> Axis B: OFF</Badge>
            <Badge variant="outline">would_write_external=false</Badge>
            <Badge variant="outline">external_write_blocked=true</Badge>
            <Badge variant="outline">customer_visible=false</Badge>
            <Badge variant="outline">bulk_action=false</Badge>
            <Badge variant="outline">rollback_required=true</Badge>
          </div>
          <p className="text-muted-foreground">
            Drafts are internal only. No CRM write, no Zazi enrolment, no APLGO write-back, no
            external API call, no dispatcher job, no message dispatch.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Step 4Y Verification</CardTitle>
          <Button size="sm" variant="outline" onClick={runTests} disabled={testBusy} className="gap-1">
            <FlaskConical className="h-4 w-4" /> {testBusy ? "Running…" : "Run Step 4Y Test Suite"}
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
        <CardHeader className="pb-2"><CardTitle className="text-base">Eligible performed manual actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {actions.length === 0 && <p className="text-sm text-muted-foreground">No performed manual actions available.</p>}
          {actions.map((a) => (
            <div key={a.id} className="rounded border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-medium text-sm">{a.action_title}</div>
                  <div className="text-xs text-muted-foreground">{a.app_id} · {a.event_name ?? "—"}</div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="default">A:{a.axis_a_snapshot}</Badge>
                  <Badge variant="default">B:{a.axis_b_snapshot}</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{a.action_summary}</div>

              <div className="grid gap-2 md:grid-cols-3">
                {TARGETS.map((t) => {
                  const key = `${a.id}:${t.key}:${t.type}`;
                  const already = drafts.some(d => d.source_manual_action_id === a.id && d.target_app === t.key && d.integration_action_type === t.type);
                  return (
                    <div key={key} className="rounded border border-border/60 p-2 space-y-1">
                      <div className="text-xs font-medium">{t.label}</div>
                      <Textarea
                        placeholder="Optional internal draft note (no banned wording, no PII)."
                        value={draftNote[key] ?? ""}
                        onChange={(e) => setDraftNote(m => ({ ...m, [key]: e.target.value }))}
                        rows={2}
                        className="text-xs"
                      />
                      <Button
                        size="sm"
                        className="w-full gap-1"
                        disabled={busyKey === key || already}
                        onClick={() => recordDraft(a.id, t.key, t.type)}
                      >
                        <FileText className="h-3 w-3" />
                        {already ? "Already drafted" : busyKey === key ? "Drafting…" : "Create internal draft"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1"
                        disabled={busyKey === `${a.id}:${t.key}:read_only_context_link`}
                        onClick={() => recordDraft(a.id, t.key, "read_only_context_link")}
                      >
                        <Eye className="h-3 w-3" /> Read-only context link
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Internal integration drafts</CardTitle>
          <div className="flex gap-1">
            {(["all","crm","zazi_mail","aplgo"] as const).map(k => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
                {k === "all" ? "All" : k === "zazi_mail" ? "Zazi" : k.toUpperCase()}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleDrafts.length === 0 && <p className="text-sm text-muted-foreground">No drafts.</p>}
          {visibleDrafts.map((d) => (
            <div key={d.id} className="rounded border border-border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="font-medium">{d.draft_title}</div>
                <div className="flex gap-1 flex-wrap">
                  <Badge variant="secondary">{d.target_app}</Badge>
                  <Badge variant="outline">{d.draft_status}</Badge>
                  <Badge variant="default">no-ext</Badge>
                  <Badge variant="default">no-cust</Badge>
                  <Badge variant="default">no-bulk</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">{d.target_surface} · {d.integration_action_type} · {new Date(d.created_at).toLocaleString()}</div>
              <div className="text-xs">{d.draft_summary}</div>
              <div className="text-[11px] font-mono text-muted-foreground break-all">manual_action={d.source_manual_action_id}</div>
              {d.draft_status === "proposed" && (
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" variant="outline" onClick={() => updateStatus(d.id, "reviewed")} className="gap-1">
                    Mark reviewed
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(d.id, "dismissed")} className="gap-1">
                    Dismiss
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(d.id, "archived")} className="gap-1">
                    <Archive className="h-3 w-3" /> Archive
                  </Button>
                </div>
              )}
              {(d.draft_status === "reviewed" || d.draft_status === "dismissed") && (
                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(d.id, "archived")} className="gap-1">
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
