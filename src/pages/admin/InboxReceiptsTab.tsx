import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";

type Receipt = {
  id: string;
  app_id: string | null;
  source_app: string | null;
  event_name: string | null;
  received_at: string;
  fingerprint_prefix: string | null;
  dedupe_key: string | null;
  safe_summary: string | null;
};

type Audit = {
  id: string;
  received_at: string;
  app_id: string | null;
  event_name: string | null;
  fingerprint_prefix: string | null;
  signature_valid: boolean | null;
  kill_switch_clear: boolean | null;
  flag_gate_clear: boolean | null;
  event_allowed: boolean | null;
  dedupe_key: string | null;
  outcome: string | null;
  reason: string | null;
};

const OUTCOME_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  persisted: "default",
  deduped: "secondary",
  rate_limited: "outline",
  rejected_signature: "destructive",
  rejected_flag: "destructive",
  rejected_kill_switch: "destructive",
  rejected_event: "destructive",
  lockout: "destructive",
};

export default function InboxReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const runTests = async () => {
    setTestBusy(true);
    setTestResult(null);
    const fnName = "vos-step4l-test-runner";
    const diagnostics: Record<string, unknown> = {
      function: fnName,
      admin_session_exists: false,
      access_token_exists: false,
      authorization_header_attached: false,
      apikey_attached: false,
    };
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? null;
      diagnostics.admin_session_exists = !!sessionData?.session;
      diagnostics.access_token_exists = !!accessToken;

      if (!accessToken) {
        setTestResult({ ok: false, error: "No active session — please sign in again.", diagnostics });
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const url = `${supabaseUrl}/functions/v1/${fnName}`;

      diagnostics.authorization_header_attached = true;
      diagnostics.apikey_attached = !!anonKey;

      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            apikey: anonKey,
          },
          body: JSON.stringify({}),
        });
      } catch (networkErr: any) {
        setTestResult({
          ok: false,
          error: "Network error reaching Edge Function",
          network_error: String(networkErr?.message ?? networkErr),
          diagnostics,
        });
        return;
      }

      diagnostics.http_status = res.status;
      const rawText = await res.text();
      let parsed: any = null;
      try { parsed = JSON.parse(rawText); } catch { parsed = null; }

      if (!res.ok) {
        setTestResult({
          ok: false,
          error: parsed?.reason || parsed?.error || `Edge function returned ${res.status}`,
          http_status: res.status,
          response_body: parsed ?? rawText.slice(0, 2000),
          diagnostics,
        });
        return;
      }

      setTestResult(parsed ?? { ok: true, _raw: rawText.slice(0, 2000), diagnostics });
      await load();
    } catch (e: any) {
      setTestResult({ ok: false, error: String(e?.message ?? e), diagnostics });
    } finally {
      setTestBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [recRes, audRes] = await Promise.all([
        supabase
          .from("vos_signed_inbox" as any)
          .select("id, app_id, source_app, event_name, received_at, fingerprint_prefix, dedupe_key, safe_summary")
          .not("app_id", "is", null)
          .order("received_at", { ascending: false })
          .limit(100),
        supabase
          .from("vos_inbox_receive_audit" as any)
          .select("*")
          .order("received_at", { ascending: false })
          .limit(50),
      ]);
      setReceipts(((recRes.data ?? []) as unknown) as Receipt[]);
      setAudits(((audRes.data ?? []) as unknown) as Audit[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Inbox Receipts — Level 2 (read-only)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Signed inbox-only packets accepted and stored (redacted only). No dispatch. No send. No replay.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={runTests} disabled={testBusy}>
              {testBusy ? "Running…" : "Run Step 4L Test Suite"}
            </Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inbox receipts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left p-2">App</th>
                    <th className="text-left p-2">Event</th>
                    <th className="text-left p-2">Received</th>
                    <th className="text-left p-2">Fingerprint</th>
                    <th className="text-left p-2">Dedupe</th>
                    <th className="text-left p-2">Safe summary</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2 font-mono text-xs">{r.app_id ?? r.source_app}</td>
                      <td className="p-2 font-mono text-xs">{r.event_name}</td>
                      <td className="p-2 text-xs">{new Date(r.received_at).toLocaleString()}</td>
                      <td className="p-2 font-mono text-xs">{r.fingerprint_prefix ?? "—"}</td>
                      <td className="p-2 font-mono text-xs">
                        {r.dedupe_key ? r.dedupe_key.slice(0, 12) + "…" : "—"}
                      </td>
                      <td className="p-2 text-xs">{r.safe_summary ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {testResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Step 4L Test Suite — Last Run</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Toggles Axis B for the test only, then restores OFF + engaged. Axis A never touched.
                </p>
              </div>
              <Badge variant={testResult?.ok ? "default" : "destructive"} className="text-xs">
                {testResult?.ok ? "PASS" : "FAIL"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {testResult?.verdict && (
              <div className="text-sm font-medium">{testResult.verdict}</div>
            )}
            {testResult?.summary && (
              <div className="text-xs text-muted-foreground">
                Assertions: <span className="font-mono">{testResult.summary.passed}/{testResult.summary.total} passed</span>
                {typeof testResult?.final?.delta_inbox === "number" && (
                  <> · delta_inbox: <span className="font-mono">{testResult.final.delta_inbox}</span></>
                )}
                {typeof testResult?.final?.delta_audit === "number" && (
                  <> · delta_audit: <span className="font-mono">{testResult.final.delta_audit}</span></>
                )}
              </div>
            )}
            {testResult?.assertions && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                {Object.entries(testResult.assertions).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border rounded px-2 py-1">
                    <span className="font-mono">{k}</span>
                    <Badge variant={v ? "default" : "destructive"} className="text-xs">
                      {v ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            {(testResult?.final_axis_a_state || testResult?.final_axis_b_state) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {testResult?.final_axis_b_state && (
                  <div className="border rounded p-2">
                    <div className="font-semibold mb-1">Axis B final (must be OFF)</div>
                    <pre className="text-[11px] overflow-x-auto">{JSON.stringify(testResult.final_axis_b_state, null, 2)}</pre>
                  </div>
                )}
                {testResult?.final_axis_a_state && (
                  <div className="border rounded p-2">
                    <div className="font-semibold mb-1">Axis A final (must be RED)</div>
                    <pre className="text-[11px] overflow-x-auto">{JSON.stringify(testResult.final_axis_a_state, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
            <details>
              <summary className="text-xs text-muted-foreground cursor-pointer">Raw JSON</summary>
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-96 mt-2">
                {JSON.stringify(testResult, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Receive Audit — last 50 outcomes
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Every receive attempt: persisted, deduped, rejected, rate_limited.
          </p>
        </CardHeader>
        <CardContent>
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit rows yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left p-2">When</th>
                    <th className="text-left p-2">App</th>
                    <th className="text-left p-2">Event</th>
                    <th className="text-left p-2">Outcome</th>
                    <th className="text-left p-2">Sig</th>
                    <th className="text-left p-2">Flag</th>
                    <th className="text-left p-2">KS</th>
                    <th className="text-left p-2">Dedupe</th>
                    <th className="text-left p-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="p-2 text-xs">{new Date(a.received_at).toLocaleString()}</td>
                      <td className="p-2 font-mono text-xs">{a.app_id ?? "—"}</td>
                      <td className="p-2 font-mono text-xs">{a.event_name ?? "—"}</td>
                      <td className="p-2">
                        <Badge variant={OUTCOME_VARIANT[a.outcome ?? ""] ?? "outline"} className="text-xs">
                          {a.outcome ?? "—"}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs">{a.signature_valid === null ? "—" : a.signature_valid ? "✓" : "✗"}</td>
                      <td className="p-2 text-xs">{a.flag_gate_clear === null ? "—" : a.flag_gate_clear ? "✓" : "✗"}</td>
                      <td className="p-2 text-xs">{a.kill_switch_clear === null ? "—" : a.kill_switch_clear ? "✓" : "✗"}</td>
                      <td className="p-2 font-mono text-xs">
                        {a.dedupe_key ? a.dedupe_key.slice(0, 10) + "…" : "—"}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{a.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Read-only. No Send, Replay, Approve, Forward, Bulk, or mutation actions exist on this surface by design.
      </p>
    </div>
  );
}
