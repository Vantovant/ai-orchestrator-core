import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, ShieldCheck, Download, ChevronLeft, ChevronRight } from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// Step 4N — Receipt Intelligence Dashboard
// READ-ONLY. No write paths. No dispatch. No send. No approve/reject UI.
// Deterministic classifier. No AI. No randomness.
// ───────────────────────────────────────────────────────────────────────────

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

type RiskLevel = "info" | "low" | "medium" | "medium-high" | "high" | "unknown";
type Confidence = "high" | "low";

type Classification = {
  category: string;
  risk: RiskLevel;
  confidence: Confidence;
  insight: string;
};

type Joined = {
  id: string;
  received_at: string;
  app_id: string | null;
  event_name: string | null;
  outcome: string;
  fingerprint_prefix: string | null;
  dedupe_key: string | null;
  safe_summary: string | null;
  signature_valid: boolean | null;
  flag_gate_clear: boolean | null;
  kill_switch_clear: boolean | null;
  event_allowed: boolean | null;
  reason: string | null;
  classification: Classification;
};

// Allowed insight strings (verbatim). All insights are observation-only.
// No banned action verbs (send, reply, enrol, enroll, follow up, push, dispatch,
// forward, contact, message, notify, automate, trigger, schedule).
const INSIGHT = {
  APLGO_INTEREST: "New APLGO interest signal — lead magnet downloaded.",
  HOST_HEARTBEAT: "Host node reported a healthy heartbeat. Observation only — no customer activity implied.",
  NO_ACTION: "No action taken.",
  DUPLICATE: "Duplicate ignored — already on record.",
  SIG_FAIL: "Signature failed — packet discarded.",
  EVENT_REJECTED: "Event rejected — outside allowed scope.",
  FLAG_OFF: "Receive flag was off — packet not stored.",
  KILL_SWITCH: "Kill-switch engaged — packet not stored.",
  RATE_LIMIT: "Rate limit reached — packet not stored.",
  LOCKOUT: "Lockout active — packet not stored.",
  UNKNOWN: "Receipt logged but not classified. Manual review recommended.",
} as const;

export function classify(outcome: string | null | undefined, eventName: string | null | undefined, appId?: string | null): Classification {
  switch (outcome) {
    case "persisted":
      if (eventName === "aplgo.lead_magnet.downloaded") {
        return {
          category: "lead_interest",
          risk: "low",
          confidence: "high",
          insight: `${INSIGHT.APLGO_INTEREST} ${INSIGHT.NO_ACTION}`,
        };
      }
      if (eventName === "vantoos.health.ping" && (!appId || appId === "app_vantoos_host")) {
        return {
          category: "system_telemetry",
          risk: "info",
          confidence: "high",
          insight: INSIGHT.HOST_HEARTBEAT,
        };
      }
      return { category: "needs_manual_review", risk: "unknown", confidence: "low", insight: INSIGHT.UNKNOWN };
    case "deduped":
      return { category: "duplicate_ignored", risk: "low", confidence: "high", insight: INSIGHT.DUPLICATE };
    case "rejected_signature":
      return { category: "signature_failure", risk: "high", confidence: "high", insight: INSIGHT.SIG_FAIL };
    case "rejected_event":
      return { category: "out_of_scope_event", risk: "medium-high", confidence: "high", insight: INSIGHT.EVENT_REJECTED };
    case "rejected_flag":
      return { category: "flag_gate_block", risk: "medium", confidence: "high", insight: INSIGHT.FLAG_OFF };
    case "rejected_kill_switch":
      return { category: "kill_switch_block", risk: "medium", confidence: "high", insight: INSIGHT.KILL_SWITCH };
    case "rate_limited":
      return { category: "rate_limit_hit", risk: "high", confidence: "high", insight: INSIGHT.RATE_LIMIT };
    case "lockout":
      return { category: "lockout", risk: "high", confidence: "high", insight: INSIGHT.LOCKOUT };
    default:
      return { category: "needs_manual_review", risk: "unknown", confidence: "low", insight: INSIGHT.UNKNOWN };
  }
}

const RISK_VARIANT: Record<RiskLevel, "default" | "destructive" | "secondary" | "outline"> = {
  info: "secondary",
  low: "secondary",
  medium: "outline",
  "medium-high": "outline",
  high: "destructive",
  unknown: "outline",
};

const PAGE_SIZE = 50;

export default function ReceiptIntelligenceTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(false);

  const [fApp, setFApp] = useState<string>("all");
  const [fEvent, setFEvent] = useState<string>("all");
  const [fCategory, setFCategory] = useState<string>("all");
  const [fOutcome, setFOutcome] = useState<string>("all");
  const [fRisk, setFRisk] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const [recRes, audRes] = await Promise.all([
        supabase
          .from("vos_signed_inbox" as any)
          .select("id, app_id, source_app, event_name, received_at, fingerprint_prefix, dedupe_key, safe_summary")
          .order("received_at", { ascending: false })
          .limit(1000),
        supabase
          .from("vos_inbox_receive_audit" as any)
          .select(
            "id, received_at, app_id, event_name, fingerprint_prefix, signature_valid, kill_switch_clear, flag_gate_clear, event_allowed, dedupe_key, outcome, reason",
          )
          .order("received_at", { ascending: false })
          .limit(1000),
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

  // Build a unified, deterministic row set keyed on audit rows (one per receive attempt).
  // We try to attach the matching receipt safe_summary by dedupe_key when available.
  const joined: Joined[] = useMemo(() => {
    const recByDedupe = new Map<string, Receipt>();
    for (const r of receipts) {
      if (r.dedupe_key) recByDedupe.set(r.dedupe_key, r);
    }
    return audits.map((a) => {
      const matched = a.dedupe_key ? recByDedupe.get(a.dedupe_key) : undefined;
      const outcome = a.outcome ?? "unknown";
      return {
        id: a.id,
        received_at: a.received_at,
        app_id: a.app_id,
        event_name: a.event_name,
        outcome,
        fingerprint_prefix: a.fingerprint_prefix,
        dedupe_key: a.dedupe_key,
        safe_summary: matched?.safe_summary ?? null,
        signature_valid: a.signature_valid,
        flag_gate_clear: a.flag_gate_clear,
        kill_switch_clear: a.kill_switch_clear,
        event_allowed: a.event_allowed,
        reason: a.reason,
        classification: classify(outcome, a.event_name, a.app_id),
      };
    });
  }, [receipts, audits]);

  const apps = useMemo(() => Array.from(new Set(joined.map((j) => j.app_id).filter(Boolean))) as string[], [joined]);
  const events = useMemo(() => Array.from(new Set(joined.map((j) => j.event_name).filter(Boolean))) as string[], [joined]);
  const categories = useMemo(() => Array.from(new Set(joined.map((j) => j.classification.category))), [joined]);
  const outcomes = useMemo(() => Array.from(new Set(joined.map((j) => j.outcome))), [joined]);

  const filtered = useMemo(() => {
    const fromTs = fFrom ? new Date(fFrom).getTime() : null;
    const toTs = fTo ? new Date(fTo).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
    const q = search.trim().toLowerCase();
    return joined.filter((j) => {
      if (fApp !== "all" && j.app_id !== fApp) return false;
      if (fEvent !== "all" && j.event_name !== fEvent) return false;
      if (fCategory !== "all" && j.classification.category !== fCategory) return false;
      if (fOutcome !== "all" && j.outcome !== fOutcome) return false;
      if (fRisk !== "all" && j.classification.risk !== fRisk) return false;
      const t = new Date(j.received_at).getTime();
      if (fromTs !== null && t < fromTs) return false;
      if (toTs !== null && t > toTs) return false;
      if (q && !(j.safe_summary ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [joined, fApp, fEvent, fCategory, fOutcome, fRisk, fFrom, fTo, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const kpi = useMemo(() => {
    const total = joined.length;
    const newInterest = joined.filter((j) => j.classification.category === "lead_interest").length;
    const rejections = joined.filter((j) => j.outcome.startsWith("rejected_")).length;
    const duplicates = joined.filter((j) => j.outcome === "deduped").length;
    const riskAlerts = joined.filter((j) => j.classification.risk === "high" || j.classification.risk === "medium-high").length;
    return { total, newInterest, rejections, duplicates, riskAlerts };
  }, [joined]);

  const exportCsv = () => {
    const cols = [
      "received_at",
      "app_id",
      "event_name",
      "category",
      "confidence",
      "risk",
      "safe_summary",
      "insight",
      "outcome",
      "fingerprint_prefix",
      "dedupe_key",
      "signature_valid",
      "event_allowed",
      "flag_gate_clear",
      "kill_switch_clear",
      "reason",
    ];
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [cols.join(",")];
    for (const r of filtered) {
      lines.push(
        [
          r.received_at,
          r.app_id ?? "",
          r.event_name ?? "",
          r.classification.category,
          r.classification.confidence,
          r.classification.risk,
          r.safe_summary ?? "",
          r.classification.insight,
          r.outcome,
          r.fingerprint_prefix ?? "",
          r.dedupe_key ?? "",
          r.signature_valid,
          r.event_allowed,
          r.flag_gate_clear,
          r.kill_switch_clear,
          r.reason ?? "",
        ]
          .map(escape)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-intelligence-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Receipt Intelligence — Read Only
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Deterministic classification of inbox receipts. No AI. No actions. No dispatch. No send.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KpiCard label="Total receipts" value={kpi.total} />
            <KpiCard label="New interest signals" value={kpi.newInterest} />
            <KpiCard label="Rejections" value={kpi.rejections} />
            <KpiCard label="Duplicates" value={kpi.duplicates} />
            <KpiCard label="Risk alerts" value={kpi.riskAlerts} tone="destructive" />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <FilterSelect label="App" value={fApp} onChange={setFApp} options={apps} />
            <FilterSelect label="Event" value={fEvent} onChange={setFEvent} options={events} />
            <FilterSelect label="Category" value={fCategory} onChange={setFCategory} options={categories} />
            <FilterSelect label="Outcome" value={fOutcome} onChange={setFOutcome} options={outcomes} />
            <FilterSelect
              label="Risk level"
              value={fRisk}
              onChange={setFRisk}
              options={["low", "medium", "medium-high", "high", "unknown"]}
            />
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Search safe summary</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-9"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b bg-muted/30">
                <tr>
                  <th className="text-left p-2">Received</th>
                  <th className="text-left p-2">App</th>
                  <th className="text-left p-2">Event</th>
                  <th className="text-left p-2">Category</th>
                  <th className="text-left p-2">Confidence</th>
                  <th className="text-left p-2">Risk</th>
                  <th className="text-left p-2">Safe summary</th>
                  <th className="text-left p-2">Insight</th>
                  <th className="text-left p-2">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground text-xs">
                      No receipts match the current filters.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2 text-xs whitespace-nowrap">{new Date(r.received_at).toLocaleString()}</td>
                      <td className="p-2 font-mono text-xs">{r.app_id ?? "—"}</td>
                      <td className="p-2 font-mono text-xs">{r.event_name ?? "—"}</td>
                      <td className="p-2 text-xs">{r.classification.category}</td>
                      <td className="p-2 text-xs">{r.classification.confidence}</td>
                      <td className="p-2">
                        <Badge variant={RISK_VARIANT[r.classification.risk]} className="text-xs">
                          {r.classification.risk}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs max-w-[280px] truncate" title={r.safe_summary ?? ""}>
                        {r.safe_summary ?? "—"}
                      </td>
                      <td className="p-2 text-xs">{r.classification.insight}</td>
                      <td className="p-2 text-xs font-mono">{r.outcome}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Showing {(filtered.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1)}–
              {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                Page {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Read-only by design. No Send, Reply, Replay, Approve, Reject, Push, Enrol, Forward, Bulk, Edit, Delete, or
            Retry actions exist on this surface.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number; tone?: "default" | "destructive" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${tone === "destructive" ? "text-destructive" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
