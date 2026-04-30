// Vanto OS — Step 4Q Proposal Curator (admin-triggered, deterministic, INERT)
//
// Reads vos_signed_inbox + vos_inbox_receive_audit and creates inert proposals
// in vos_proposal_queue.
//
// Hard invariants enforced server-side:
//   would_dispatch=false, dispatch_blocked=true, safety_blocked=true
//   only allowed proposal_types
//   forbidden-verb scan on title/summary/reason
//   dedupe by (source_receipt_id|source_audit_id, proposal_type)
//
// NO outbound. NO send. NO consume. NO dispatcher invocation. NO external service.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APLGO_APP = "app_aplgo_mlm";
const APLGO_EVENT = "aplgo.lead_magnet.downloaded";
const HOST_APP = "app_vantoos_host";
const HOST_EVENT = "vantoos.health.ping";

const BANNED = [
  "send","reply","enrol","enroll","follow up","push","dispatch",
  "forward","contact","message","notify","automate","trigger","schedule",
];

function containsBanned(text: string): string | null {
  const t = text.toLowerCase();
  for (const w of BANNED) if (t.includes(w)) return w;
  return null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { ok: false, status: 401, reason: "missing_bearer_token" };
  const token = auth.replace("Bearer ", "");
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } });
  const { data, error } = await sb.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) return { ok: false, status: 401, reason: "invalid_token" };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: roles } = await admin.from("user_roles").select("id").eq("user_id", userId).eq("role", "admin").limit(1);
  if (!roles || roles.length === 0) return { ok: false, status: 403, reason: "not_admin" };
  return { ok: true, userId };
}

type ProposalDraft = {
  source_receipt_id: string | null;
  source_audit_id: string | null;
  app_id: string;
  event_name: string | null;
  intelligence_category: string;
  risk_level: string;
  proposal_type: string;
  proposal_title: string;
  proposal_summary: string;
  confidence: string;
  reason: string;
};

// Pure deterministic mapper. No I/O. Used both server-side and unit-tested.
export function buildProposal(receipt: {
  id: string;
  app_id: string | null;
  event_name: string | null;
}): ProposalDraft | null {
  const app = receipt.app_id ?? "";
  const evt = receipt.event_name ?? "";

  if (app === APLGO_APP && evt === APLGO_EVENT) {
    return {
      source_receipt_id: receipt.id,
      source_audit_id: null,
      app_id: app,
      event_name: evt,
      intelligence_category: "lead_interest",
      risk_level: "low",
      proposal_type: "manual_review",
      proposal_title: "Review APLGO interest signal",
      proposal_summary:
        "A lead magnet download was received and classified as lead_interest. No action taken.",
      confidence: "high",
      reason: "persisted lead_interest receipt",
    };
  }

  if (app === HOST_APP && evt === HOST_EVENT) {
    return {
      source_receipt_id: receipt.id,
      source_audit_id: null,
      app_id: app,
      event_name: evt,
      intelligence_category: "system_telemetry",
      risk_level: "info",
      proposal_type: "no_action_record",
      proposal_title: "Host health ping recorded",
      proposal_summary:
        "Host telemetry was received and classified as system_telemetry. No action taken.",
      confidence: "high",
      reason: "persisted system_telemetry receipt",
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ ok: false, reason: gate.reason }), {
      status: gate.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Pull recent persisted receipts only (no rejected paths in 4Q).
  const { data: receipts, error: recErr } = await admin
    .from("vos_signed_inbox")
    .select("id, app_id, event_name, received_at")
    .order("received_at", { ascending: false })
    .limit(500);
  if (recErr) {
    return new Response(JSON.stringify({ ok: false, reason: "receipt_query_failed", error: recErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const created: any[] = [];
  const skipped_dedupe: any[] = [];
  const skipped_no_mapping: any[] = [];
  const rejected_banned: any[] = [];
  let inserted = 0;

  for (const r of receipts ?? []) {
    const draft = buildProposal(r);
    if (!draft) { skipped_no_mapping.push({ id: r.id, app_id: r.app_id, event_name: r.event_name }); continue; }

    // Forbidden-verb scan (defense in depth — DB trigger also enforces).
    const banned = containsBanned(`${draft.proposal_title} ${draft.proposal_summary} ${draft.reason}`);
    if (banned) { rejected_banned.push({ receipt_id: r.id, token: banned }); continue; }

    const dedupe_key = await sha256Hex(`${draft.source_receipt_id ?? draft.source_audit_id}:${draft.proposal_type}`);

    const insertRow = {
      ...draft,
      proposal_status: "proposed",
      safety_blocked: true,
      would_dispatch: false,
      dispatch_blocked: true,
      created_by_system: "vos-proposal-curator-v1",
      dedupe_key,
    };

    const { data: ins, error: insErr } = await admin
      .from("vos_proposal_queue")
      .insert(insertRow)
      .select("id, dedupe_key, proposal_type")
      .maybeSingle();

    if (insErr) {
      // Unique violation on dedupe_key → expected when re-running.
      if ((insErr as any).code === "23505" || /duplicate key/i.test(insErr.message)) {
        skipped_dedupe.push({ receipt_id: r.id, dedupe_key, proposal_type: draft.proposal_type });
        continue;
      }
      // Any other error → return for visibility.
      return new Response(JSON.stringify({ ok: false, reason: "insert_failed", error: insErr.message, row: insertRow }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (ins) { inserted++; created.push(ins); }
  }

  return new Response(JSON.stringify({
    ok: true,
    notice: "Proposal curator complete. Inert proposals only. NO send. NO dispatch. NO outbound.",
    summary: {
      receipts_scanned: receipts?.length ?? 0,
      proposals_inserted: inserted,
      skipped_dedupe: skipped_dedupe.length,
      skipped_no_mapping: skipped_no_mapping.length,
      rejected_banned: rejected_banned.length,
    },
    created,
    skipped_dedupe,
    rejected_banned,
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
