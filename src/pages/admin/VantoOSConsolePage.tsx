import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, ShieldAlert, Lock, RefreshCw, AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";
import { toast } from "sonner";

type Row = Record<string, any>;

const LOCKED_FLAGS = [
  { key: "VANTO_OS_ENABLED", expected: "false" },
  { key: "EMAIL_SEND_ENABLED", expected: "false" },
  { key: "WHATSAPP_SEND_ENABLED", expected: "false" },
  { key: "MASTER_PROSPECTOR_STATE", expected: "ASLEEP" },
  { key: "PHASE_4A_STEP_3", expected: "OFF" },
];

const SAMPLE_PACKET = JSON.stringify(
  {
    packet_id: "pkt_test_0001",
    source_app: "vanto_crm",
    target_app: "vantoos_executive",
    event_type: "lead_captured",
    timestamp: Math.floor(Date.now() / 1000),
    idempotency_key: "a".repeat(32),
    payload: {
      name: "Test Lead",
      email: "test@example.com",
      phone: "+27 82 555 0100",
      sa_id: "9001015009087",
      message: "Interested in the executive plan.",
    },
  },
  null,
  2,
);

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge variant={ok ? "default" : "destructive"} className="gap-1">
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

export default function VantoOSConsolePage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [registry, setRegistry] = useState<Row[]>([]);
  const [flags, setFlags] = useState<Row[]>([]);
  const [killSwitches, setKillSwitches] = useState<Row[]>([]);
  const [signedInbox, setSignedInbox] = useState<Row[]>([]);
  const [inboundLog, setInboundLog] = useState<Row[]>([]);
  const [outboundLog, setOutboundLog] = useState<Row[]>([]);
  const [decisionLog, setDecisionLog] = useState<Row[]>([]);
  const [killswitchLog, setKillswitchLog] = useState<Row[]>([]);

  // Dry run state
  const [packetText, setPacketText] = useState(SAMPLE_PACKET);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [dryRunBusy, setDryRunBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .limit(1)
      .then(({ data }) => setIsAdmin((data ?? []).length > 0));
  }, [user]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [r, f, k, s, ib, ob, dl, kl] = await Promise.all([
        (supabase as any).from("vos_app_registry").select("*").order("app_key"),
        (supabase as any).from("vos_platform_flags").select("*").order("flag_key"),
        (supabase as any).from("vos_kill_switches").select("*").order("scope"),
        (supabase as any).from("vos_signed_inbox").select("*").order("created_at", { ascending: false }).limit(50),
        (supabase as any).from("vos_inbound_log").select("*").order("created_at", { ascending: false }).limit(50),
        (supabase as any).from("vos_outbound_log").select("*").order("created_at", { ascending: false }).limit(50),
        (supabase as any).from("vos_decision_log").select("*").order("created_at", { ascending: false }).limit(50),
        (supabase as any).from("vos_killswitch_log").select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      setRegistry(r.data ?? []);
      setFlags(f.data ?? []);
      setKillSwitches(k.data ?? []);
      setSignedInbox(s.data ?? []);
      setInboundLog(ib.data ?? []);
      setOutboundLog(ob.data ?? []);
      setDecisionLog(dl.data ?? []);
      setKillswitchLog(kl.data ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadAll();
  }, [isAdmin]);

  const runDryRun = async () => {
    setDryRunBusy(true);
    setDryRunResult(null);
    try {
      const parsed = JSON.parse(packetText);
      const { data, error } = await supabase.functions.invoke("vos-dry-run", {
        body: { packet: parsed },
      });
      if (error) throw error;
      setDryRunResult(data);
      toast.success("Dry-run complete — nothing was dispatched or stored.");
    } catch (e: any) {
      setDryRunResult({ error: e.message ?? String(e) });
      toast.error("Dry-run failed");
    } finally {
      setDryRunBusy(false);
    }
  };

  if (isAdmin === null) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <Shield className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-lg font-bold">Access Denied</h2>
            <p className="text-sm text-muted-foreground">
              Vanto OS console is restricted to platform administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const flagsLocked = LOCKED_FLAGS.every((lf) => {
    const row = flags.find((f) => f.flag_key === lf.key);
    return row && String(row.flag_value) === lf.expected;
  });
  const allKillEngaged = killSwitches.every((k) => k.state === "engaged");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-destructive" /> Vanto OS — Central Brain
          </h1>
          <p className="text-sm text-muted-foreground">
            Read-only / dry-run admin console. No live traffic is authorised.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Lock banner */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <Lock className="h-4 w-4" /> TRAFFIC GATE: 🔴 RED — All sends locked off
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {LOCKED_FLAGS.map((lf) => {
              const row = flags.find((f) => f.flag_key === lf.key);
              const ok = row && String(row.flag_value) === lf.expected;
              return (
                <StatusPill
                  key={lf.key}
                  ok={!!ok}
                  label={`${lf.key}=${row?.flag_value ?? "?"}`}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Build stage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Build Stage</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Step 1 — DB rails complete</div>
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Step 2 — Verifiers complete</div>
          <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-amber-500" /> Step 3 — Admin console (in progress)</div>
          <div className="flex items-center gap-2 text-muted-foreground"><Lock className="h-4 w-4" /> Live traffic NOT authorised</div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registry">App Registry</TabsTrigger>
          <TabsTrigger value="flags">Platform Flags</TabsTrigger>
          <TabsTrigger value="kill">Kill-Switches</TabsTrigger>
          <TabsTrigger value="inbox">Signed Inbox</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="dryrun">Dry-Run Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Apps registered</div><div className="text-2xl font-bold">{registry.length}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Flags locked</div><div className="text-2xl font-bold">{flagsLocked ? "✅ Yes" : "❌ No"}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Kill-switches engaged</div><div className="text-2xl font-bold">{allKillEngaged ? "✅ All" : "⚠️ Partial"}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Signed inbox rows</div><div className="text-2xl font-bold">{signedInbox.length}</div></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Forbidden actions (UI enforced)</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              <div>• No live send buttons • No dispatch buttons • No approve-to-send</div>
              <div>• No flag toggles • No kill-switch disengage • No secret provisioning</div>
              <div>• No HMAC key generation • No live app connections • No packet publish/consume</div>
              <div>• No email / WhatsApp send • No contact enrolment • No automation changes</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Schema Fingerprint</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr><th className="text-left px-3 py-2 font-medium">Table</th><th className="text-left px-3 py-2 font-medium">Column count</th></tr>
                </thead>
                <tbody>
                  {[
                    ["vos_app_registry", 10],
                    ["vos_platform_flags", 8],
                    ["vos_signed_inbox", 16],
                    ["vos_kill_switches", 8],
                    ["vos_inbound_log", 8],
                    ["vos_outbound_log", 7],
                    ["vos_decision_log", 7],
                    ["vos_killswitch_log", 8],
                  ].map(([t, n]) => (
                    <tr key={t as string} className="border-t border-border">
                      <td className="px-3 py-2 font-mono text-xs">{t}</td>
                      <td className="px-3 py-2">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">Static reference of expected column counts per table. Drift from these values indicates a schema change requiring console reconciliation.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registry" className="pt-4">
          <DataTable rows={registry} cols={["app_key", "display_name", "role", "owner_scope", "app_status", "created_at"]} />
        </TabsContent>

        <TabsContent value="flags" className="pt-4">
          <DataTable rows={flags} cols={["flag_key", "flag_value", "locked", "description", "updated_at"]} />
        </TabsContent>

        <TabsContent value="kill" className="pt-4">
          <DataTable rows={killSwitches} cols={["scope", "scope_target", "state", "reason", "updated_at"]} />
        </TabsContent>

        <TabsContent value="inbox" className="pt-4">
          <DataTable rows={signedInbox} cols={["idempotency_key", "source_app", "event_name", "processing_state", "received_at", "created_at"]} />
        </TabsContent>

        <TabsContent value="audit" className="space-y-6 pt-4">
          <section>
            <h3 className="font-semibold mb-2">Inbound Log</h3>
            <DataTable rows={inboundLog} cols={["source_app", "event_name", "signature_valid", "outcome", "created_at"]} />
          </section>
          <section>
            <h3 className="font-semibold mb-2">Outbound Log</h3>
            <DataTable rows={outboundLog} cols={["target_app", "event_name", "idempotency_key", "outcome", "created_at"]} />
          </section>
          <section>
            <h3 className="font-semibold mb-2">Decision Log</h3>
            <DataTable rows={decisionLog} cols={["decision", "rationale", "created_at"]} />
          </section>
          <section>
            <h3 className="font-semibold mb-2">Kill-Switch Log</h3>
            <DataTable rows={killswitchLog} cols={["scope", "app_code", "from_state", "to_state", "actor", "created_at"]} />
          </section>
        </TabsContent>

        <TabsContent value="dryrun" className="space-y-4 pt-4">
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                <FlaskConical className="h-4 w-4" /> Dry-Run Preview
              </div>
              <p className="text-muted-foreground mt-1">
                Runs <code>vos-dry-run</code> through signature, idempotency and PII-redaction
                verifiers. Stores nothing. Dispatches nothing. No emails, no WhatsApp,
                no contact enrolment, no packets consumed.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Sample packet</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={packetText}
                onChange={(e) => setPacketText(e.target.value)}
                rows={14}
                className="font-mono text-xs"
              />
              <Button onClick={runDryRun} disabled={dryRunBusy} className="gap-2">
                <FlaskConical className="h-4 w-4" />
                {dryRunBusy ? "Running…" : "Run Dry-Run (no side effects)"}
              </Button>
            </CardContent>
          </Card>
          {dryRunResult && (
            <Card>
              <CardHeader><CardTitle className="text-base">Verifier output</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
                  {JSON.stringify(dryRunResult, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DataTable({ rows, cols }: { rows: Row[]; cols: string[] }) {
  if (!rows.length) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No rows.</CardContent></Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {cols.map((c) => (
                <th key={c} className="text-left px-3 py-2 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 align-top">
                    {formatCell(r[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function formatCell(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
