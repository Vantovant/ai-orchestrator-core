import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Target, Send, Inbox, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type Directive = {
  id: string;
  title: string;
  goal_text: string;
  kpi_target: any;
  horizon_days: number;
  status: string;
  created_at: string;
  closed_at: string | null;
};
type TargetRow = {
  id: string;
  directive_id: string;
  app_key: string;
  delivery_status: string;
  delivered_at: string | null;
  error: string | null;
};
type Snapshot = {
  id: string;
  directive_id: string | null;
  app_key: string;
  kind: string;
  payload: any;
  received_at: string;
};
type Proposal = {
  id: string;
  directive_id: string | null;
  app_key: string;
  summary: string;
  detail: any;
  review_state: string;
  reviewed_at: string | null;
  created_at: string;
};

const SPOKES = [
  { key: "getwell_hub", label: "GetWell Hub" },
  { key: "getwell_grow", label: "GetWell Grow" },
  { key: "getwell_africa", label: "GetWell Africa" },
  { key: "mlm_course", label: "MLM Course" },
  { key: "vanto_crm", label: "Vanto CRM" },
];

function StatusBadge({ state }: { state: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    draft: "secondary",
    broadcast: "default",
    closed: "outline",
    delivered: "default",
    pending: "secondary",
    failed: "destructive",
    approved: "default",
    rejected: "destructive",
  };
  return <Badge variant={map[state] ?? "outline"}>{state}</Badge>;
}

export default function StrategyEngineTab() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Draft form
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [kpi, setKpi] = useState('{"metric":"new_paying_users","target":500}');
  const [horizon, setHorizon] = useState(30);
  const [selectedSpokes, setSelectedSpokes] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const [d, t, s, p] = await Promise.all([
      supabase.from("vos_strategy_directives").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("vos_strategy_targets").select("*").order("created_at", { ascending: false }).limit(200),
      supabase.from("vos_strategy_snapshots").select("*").order("received_at", { ascending: false }).limit(100),
      supabase.from("vos_strategy_proposals").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setDirectives((d.data as Directive[]) ?? []);
    setTargets((t.data as TargetRow[]) ?? []);
    setSnapshots((s.data as Snapshot[]) ?? []);
    setProposals((p.data as Proposal[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function createDirective() {
    if (!title.trim() || !goal.trim()) {
      toast.error("Title and goal are required");
      return;
    }
    let kpiJson: any = {};
    try { kpiJson = JSON.parse(kpi || "{}"); } catch { toast.error("KPI target must be valid JSON"); return; }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("vos_strategy_directives").insert({
      title: title.trim(),
      goal_text: goal.trim(),
      kpi_target: kpiJson,
      horizon_days: horizon,
      status: "draft",
      created_by: user?.id ?? null,
    }).select().single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Directive drafted");
    setTitle(""); setGoal("");
    load();
    return data as Directive;
  }

  async function broadcast(directive: Directive) {
    const keys = Object.entries(selectedSpokes).filter(([, v]) => v).map(([k]) => k);
    if (keys.length === 0) { toast.error("Select at least one spoke"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("suite-bridge-hub", {
      body: { action: "broadcast_directive", directive_id: directive.id, app_keys: keys },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    const results = (data as any)?.delivered ?? [];
    const okCount = results.filter((r: any) => r.delivery_status === "delivered").length;
    toast.success(`Broadcast: ${okCount}/${results.length} delivered`);
    load();
  }

  async function reviewProposal(id: string, state: "approved" | "rejected") {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("vos_strategy_proposals").update({
      review_state: state,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Proposal ${state}`);
    load();
  }

  async function closeDirective(id: string) {
    const { error } = await supabase.from("vos_strategy_directives").update({
      status: "closed", closed_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Directive closed");
    load();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4" /> Strategy Engine
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Issue suite-wide strategic directives. Spokes execute in their own way and report back via signed
            snapshots and proposals for your review. This is governance — not marketing sends.
          </p>
        </CardHeader>
      </Card>

      <Tabs defaultValue="draft">
        <TabsList>
          <TabsTrigger value="draft">New Directive</TabsTrigger>
          <TabsTrigger value="directives">Directives ({directives.length})</TabsTrigger>
          <TabsTrigger value="proposals">Proposals ({proposals.filter(p => p.review_state === "pending").length})</TabsTrigger>
          <TabsTrigger value="snapshots">Snapshots ({snapshots.length})</TabsTrigger>
        </TabsList>

        {/* --- New Directive --- */}
        <TabsContent value="draft" className="pt-4">
          <Card>
            <CardHeader><CardTitle>Draft a directive</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Q3 growth push" />
              </div>
              <div>
                <Label>Goal (executive intent)</Label>
                <Textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3}
                  placeholder="Add 500 new paying users across the suite within 90 days." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>KPI target (JSON)</Label>
                  <Textarea value={kpi} onChange={(e) => setKpi(e.target.value)} rows={3} className="font-mono text-xs" />
                </div>
                <div>
                  <Label>Horizon (days)</Label>
                  <Input type="number" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
                </div>
              </div>
              <div>
                <Label>Target spokes</Label>
                <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
                  {SPOKES.map(s => (
                    <label key={s.key} className="flex items-center gap-2 rounded border p-2 text-sm">
                      <Checkbox
                        checked={!!selectedSpokes[s.key]}
                        onCheckedChange={(v) => setSelectedSpokes(prev => ({ ...prev, [s.key]: !!v }))}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={busy}
                  onClick={async () => {
                    const d = await createDirective();
                    if (d) await broadcast(d);
                  }}
                >
                  <Send className="mr-2 h-4 w-4" /> Save & broadcast
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => createDirective()}>
                  Save as draft
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- Directives list --- */}
        <TabsContent value="directives" className="pt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
          {directives.length === 0 && (
            <p className="text-sm text-muted-foreground">No directives yet. Draft one in the previous tab.</p>
          )}
          {directives.map(d => {
            const dTargets = targets.filter(t => t.directive_id === d.id);
            const dProposals = proposals.filter(p => p.directive_id === d.id);
            return (
              <Card key={d.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{d.title}</CardTitle>
                      <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()} · {d.horizon_days}d horizon</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge state={d.status} />
                      {d.status !== "closed" && (
                        <Button size="sm" variant="ghost" onClick={() => closeDirective(d.id)}>Close</Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">{d.goal_text}</p>
                  <pre className="rounded bg-muted p-2 text-xs">{JSON.stringify(d.kpi_target, null, 2)}</pre>
                  {dTargets.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Delivery receipts</p>
                      <div className="flex flex-wrap gap-2">
                        {dTargets.map(t => (
                          <Badge key={t.id} variant={t.delivery_status === "delivered" ? "default" : "destructive"}>
                            {t.app_key}: {t.delivery_status}{t.error ? ` (${t.error})` : ""}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {dProposals.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {dProposals.length} proposal(s) — see Proposals tab.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* --- Proposals --- */}
        <TabsContent value="proposals" className="pt-4 space-y-3">
          {proposals.length === 0 && <p className="text-sm text-muted-foreground">No proposals yet.</p>}
          {proposals.map(p => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{p.summary}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {p.app_key} · {new Date(p.created_at).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge state={p.review_state} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="rounded bg-muted p-2 text-xs overflow-x-auto">{JSON.stringify(p.detail, null, 2)}</pre>
                {p.review_state === "pending" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => reviewProposal(p.id, "approved")}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reviewProposal(p.id, "rejected")}>
                      <XCircle className="mr-2 h-4 w-4" /> Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* --- Snapshots --- */}
        <TabsContent value="snapshots" className="pt-4 space-y-3">
          {snapshots.length === 0 && <p className="text-sm text-muted-foreground">No snapshots received yet.</p>}
          {snapshots.map(s => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Inbox className="h-4 w-4" />
                  <CardTitle className="text-sm">{s.app_key} · {s.kind}</CardTitle>
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(s.received_at).toLocaleString()}</span>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="rounded bg-muted p-2 text-xs overflow-x-auto">{JSON.stringify(s.payload, null, 2)}</pre>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
