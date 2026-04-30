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
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
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
