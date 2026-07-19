// Step 5F — Audit Consolidation
// Unified read-only evidence stream across governance surfaces.
// Reads only. No mutations. Exports JSONL for offline evidence packs.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Download, Archive, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Evt = {
  ts: string;
  kind: string;
  ref_id: string;
  actor: string | null;
  summary: string;
  raw: any;
};

const KIND_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  proposal: "outline",
  dry_run: "outline",
  approval: "default",
  approval_status: "secondary",
  rehearsal: "secondary",
  killswitch: "destructive",
  lifecycle: "outline",
  strategy_directive: "default",
  decision: "outline",
};

const LIMIT = 200;

export default function AuditConsolidationTab() {
  const [events, setEvents] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(false);
  const [fKind, setFKind] = useState("all");
  const [search, setSearch] = useState("");
  const [sinceDays, setSinceDays] = useState<string>("14");

  const load = async () => {
    setLoading(true);
    try {
      const sinceIso = new Date(Date.now() - Number(sinceDays) * 24 * 3600 * 1000).toISOString();
      const q = (t: string) => (supabase as any).from(t).select("*").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(LIMIT);
      const [
        proposals, dryruns, approvals, rehearsals, killLog, lifecycle, strategy, decisions,
      ] = await Promise.all([
        q("vos_proposal_queue"),
        q("vos_dry_run_actions"),
        q("vos_approval_requests"),
        q("vos_role_rehearsal_log"),
        q("vos_killswitch_log"),
        q("vos_spoke_lifecycle_log"),
        q("vos_strategy_directives"),
        q("vos_decision_log"),
      ]);

      const rows: Evt[] = [];
      (proposals.data ?? []).forEach((r: any) => rows.push({
        ts: r.created_at, kind: "proposal", ref_id: r.id,
        actor: r.created_by_system ?? null,
        summary: `${r.proposal_type}: ${r.proposal_title}`, raw: r,
      }));
      (dryruns.data ?? []).forEach((r: any) => rows.push({
        ts: r.created_at, kind: "dry_run", ref_id: r.id,
        actor: r.created_by_system ?? null,
        summary: `${r.dry_run_type}: ${r.dry_run_title}`, raw: r,
      }));
      (approvals.data ?? []).forEach((r: any) => rows.push({
        ts: r.created_at, kind: "approval", ref_id: r.id,
        actor: r.requested_by_system ?? r.requested_by_user ?? null,
        summary: `${r.approval_type} [${r.approval_status}]: ${r.approval_title}`, raw: r,
      }));
      (rehearsals.data ?? []).forEach((r: any) => rows.push({
        ts: r.created_at, kind: "rehearsal", ref_id: r.id,
        actor: r.created_by ?? null,
        summary: `${r.rehearsal_kind} [${r.status}]${r.overall_pass === true ? " ✓" : r.overall_pass === false ? " ✗" : ""}`, raw: r,
      }));
      (killLog.data ?? []).forEach((r: any) => rows.push({
        ts: r.created_at, kind: "killswitch", ref_id: r.id,
        actor: r.changed_by ?? null,
        summary: `${r.scope}/${r.scope_target ?? "*"}: ${r.prev_state} → ${r.new_state} (${r.reason ?? "no reason"})`, raw: r,
      }));
      (lifecycle.data ?? []).forEach((r: any) => rows.push({
        ts: r.created_at, kind: "lifecycle", ref_id: r.id,
        actor: r.changed_by ?? null,
        summary: `spoke ${r.spoke_key ?? r.app_key ?? "?"}: ${r.action ?? "change"}`, raw: r,
      }));
      (strategy.data ?? []).forEach((r: any) => rows.push({
        ts: r.created_at, kind: "strategy_directive", ref_id: r.id,
        actor: r.issued_by ?? null,
        summary: `${r.directive_type ?? "directive"}: ${r.title ?? r.summary ?? "(untitled)"}`, raw: r,
      }));
      (decisions.data ?? []).forEach((r: any) => rows.push({
        ts: r.created_at, kind: "decision", ref_id: r.id,
        actor: r.decided_by ?? null,
        summary: `${r.decision}: ${r.reason ?? ""}`, raw: r,
      }));

      rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));
      setEvents(rows);
    } catch (e: any) {
      toast.error(`Load failed: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sinceDays]);

  const kinds = useMemo(() => Array.from(new Set(events.map((e) => e.kind))).sort(), [events]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return events.filter((e) => {
      if (fKind !== "all" && e.kind !== fKind) return false;
      if (s && !`${e.summary} ${e.ref_id} ${e.actor ?? ""}`.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [events, fKind, search]);

  const exportJsonl = () => {
    const lines = filtered.map((e) => JSON.stringify(e));
    const blob = new Blob([lines.join("\n")], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vantoos_audit_${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} events.`);
  };

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Archive className="h-5 w-5" />
            Audit Consolidation
            <Badge variant="outline" className="ml-2">READ-ONLY</Badge>
            <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> STEP 5F</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Unified evidence stream stitching proposals, dry-runs, approvals, rehearsals, kill-switch
            changes, spoke lifecycle events, strategy directives, and decision-log entries into a
            single time-ordered feed. Export as JSONL for offline evidence packs.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={load} variant="outline" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Reload
            </Button>
            <Button onClick={exportJsonl} size="sm" disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export {filtered.length} as JSONL
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Select value={sinceDays} onValueChange={setSinceDays}>
              <SelectTrigger><SelectValue placeholder="Window" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last 24 hours</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fKind} onValueChange={setFKind}>
              <SelectTrigger><SelectValue placeholder="Kind" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {kinds.map((k) => <SelectItem key={k} value={k}>{k} ({kindCounts[k]})</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Search summary / ref / actor" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="flex flex-wrap gap-1 text-xs">
            {kinds.map((k) => (
              <Badge key={k} variant={KIND_VARIANT[k] ?? "outline"}>
                {k}: {kindCounts[k]}
              </Badge>
            ))}
          </div>

          <div className="text-sm text-muted-foreground">
            {filtered.length} of {events.length} events (each source capped at {LIMIT})
          </div>

          <div className="space-y-2">
            {filtered.map((e, idx) => (
              <Card key={`${e.kind}-${e.ref_id}-${idx}`} className="border-l-4 border-l-primary/30">
                <CardContent className="pt-3 pb-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={KIND_VARIANT[e.kind] ?? "outline"}>{e.kind}</Badge>
                    <span className="text-xs font-mono text-muted-foreground">{e.ref_id.slice(0, 8)}…</span>
                    {e.actor && <span className="text-xs text-muted-foreground">actor: <code className="font-mono">{String(e.actor).slice(0, 24)}</code></span>}
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(e.ts).toLocaleString()}</span>
                  </div>
                  <div className="text-sm">{e.summary}</div>
                </CardContent>
              </Card>
            ))}
            {!loading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground py-8 text-center">
                No governance events in this window.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
