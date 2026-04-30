import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, FlaskConical, ShieldCheck } from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// Step 4O — Multi-App Inbox Receive Test Runner (read-only admin UI)
// Mirrors the Step 4L pattern. No Send / Reply / Replay / Approve / Push /
// Enrol / Bulk actions exist on this surface.
// ───────────────────────────────────────────────────────────────────────────

export default function Step4OTestsTab() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runTests = async () => {
    setBusy(true);
    setResult(null);
    const fnName = "vos-step4o-test-runner";
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
        setResult({ ok: false, error: "No active session — please sign in again.", diagnostics });
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
        setResult({
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
        setResult({
          ok: false,
          error: parsed?.reason || parsed?.error || `Edge function returned ${res.status}`,
          http_status: res.status,
          response_body: parsed ?? rawText.slice(0, 2000),
          diagnostics,
        });
        return;
      }

      setResult(parsed ?? { ok: true, _raw: rawText.slice(0, 2000), diagnostics });
    } catch (e: any) {
      setResult({ ok: false, error: String(e?.message ?? e), diagnostics });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Step 4O Tests — Multi-App Inbox Receive (read-only)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Verifies APLGO and Host inbox-only receive. Toggles Axis B for the test only, then restores
              OFF + engaged. Axis A is never touched. No dispatch. No send. No consume.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={runTests} disabled={busy}>
            <FlaskConical className="h-4 w-4 mr-1" />
            {busy ? "Running…" : "Run Step 4O Test Suite"}
          </Button>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Calls edge function: <span className="font-mono">vos-step4o-test-runner</span>. Read-only by design —
          no Send, Reply, Replay, Approve, Reject, Push, Enrol, Forward, Bulk, Edit, Delete, or Retry actions.
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Step 4O Test Suite — Last Run</CardTitle>
                {result?.notice && (
                  <p className="text-xs text-muted-foreground mt-1">{result.notice}</p>
                )}
              </div>
              <Badge variant={result?.ok ? "default" : "destructive"} className="text-xs">
                {result?.ok ? "PASS" : "FAIL"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {result?.verdict && (
              <div className="text-sm font-medium">{result.verdict}</div>
            )}

            {result?.summary && (
              <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  Assertions:{" "}
                  <span className="font-mono">
                    {result.summary.passed}/{result.summary.total} passed
                  </span>
                </span>
                {typeof result?.final?.delta_host === "number" && (
                  <span>delta_host: <span className="font-mono">{result.final.delta_host}</span></span>
                )}
                {typeof result?.final?.delta_aplgo === "number" && (
                  <span>delta_aplgo: <span className="font-mono">{result.final.delta_aplgo}</span></span>
                )}
                {typeof result?.final?.delta_audit === "number" && (
                  <span>delta_audit: <span className="font-mono">{result.final.delta_audit}</span></span>
                )}
              </div>
            )}

            {result?.assertions && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 text-xs">
                {Object.entries(result.assertions).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border rounded px-2 py-1">
                    <span className="font-mono">{k}</span>
                    <Badge variant={v ? "default" : "destructive"} className="text-xs">
                      {v ? "PASS" : "FAIL"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {result?.final_axis_a_state && (
                <div className="border rounded p-2">
                  <div className="font-semibold mb-1">Axis A final (must stay RED)</div>
                  <pre className="text-[11px] overflow-x-auto">
                    {JSON.stringify(result.final_axis_a_state, null, 2)}
                  </pre>
                </div>
              )}
              {result?.final_axis_b_state && (
                <div className="border rounded p-2">
                  <div className="font-semibold mb-1">Axis B final — APLGO + Host (must be OFF)</div>
                  <pre className="text-[11px] overflow-x-auto">
                    {JSON.stringify(result.final_axis_b_state, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <ChevronDown className="h-4 w-4" /> Raw JSON
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <pre className="text-[11px] bg-muted p-3 rounded overflow-auto max-h-96">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            {result?.error && (
              <div className="text-xs text-destructive">
                Error: <span className="font-mono">{result.error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
