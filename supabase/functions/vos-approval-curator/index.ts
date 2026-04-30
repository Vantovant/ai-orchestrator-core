// Vanto OS — Step 4U Approval Curator (admin-triggered, deterministic, INERT)
//
// Reads vos_dry_run_actions and creates one approval request per
// (source_dry_run_id, approval_type) using a closed allow-list.
// Hard invariants:
//   would_execute=false, execution_blocked=true, dispatch_blocked=true,
//   safety_blocked=true, approval_does_not_execute=true
// Forbidden-verb scan on title/summary; dedupe by sha256.
// NO outbound. NO send. NO consume. NO dispatcher. NO external service.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TYPES = new Set([
  "internal_note_approval",
  "review_status_approval",
  "no_action_confirmation",
]);

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

type ApprovalDraft = {
  source_dry_run_id: string;
  source_proposal_id: string;
  app_id: string;
  event_name: string | null;
  approval_type: string;
  approval_title: string;
  approval_summary: string;
};

// Pure deterministic mapper. Closed allow-list. No I/O.
export function buildApproval(d: {
  id: string;
  source_proposal_id: string;
  app_id: string;
  event_name: string | null;
  dry_run_type: string;
  dry_run_status: string;
}): ApprovalDraft | null {
  if (d.dry_run_status === "archived" || d.dry_run_status === "dismissed") return null;

  if (d.dry_run_type === "manual_review_preview") {
    return {
      source_dry_run_id: d.id,
      source_proposal_id: d.source_proposal_id,
      app_id: d.app_id,
      event_name: d.event_name,
      approval_type: "review_status_approval",
      approval_title: "Review status approval request",
      approval_summary: "Admin decision record only. No action taken. Records human intent.",
    };
  }

  if (d.dry_run_type === "no_action_preview") {
    return {
      source_dry_run_id: d.id,
      source_proposal_id: d.source_proposal_id,
      app_id: d.app_id,
      event_name: d.event_name,
      approval_type: "no_action_confirmation",
      approval_title: "No-action confirmation request",
      approval_summary: "Admin formally records that no action will be taken. Inert.",
    };
  }

  if (d.dry_run_type === "admin_note_preview") {
    return {
      source_dry_run_id: d.id,
      source_proposal_id: d.source_proposal_id,
      app_id: d.app_id,
      event_name: d.event_name,
      approval_type: "internal_note_approval",
      approval_title: "Internal admin note approval request",
      approval_summary: "Admin approves an internal-only record. No outbound action.",
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const gate = await requireAdmin(req);
  if (!gate.ok) {
    return new Response(JSON.stringify({ ok: false, reason: gate.reason }),
      { status: gate.status ?? 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: dryRuns, error: dErr } = await admin
    .from("vos_dry_run_actions")
    .select("id, source_proposal_id, app_id, event_name, dry_run_type, dry_run_status")
    .not("dry_run_status", "in", "(archived,dismissed)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (dErr) {
    return new Response(JSON.stringify({ ok: false, reason: "dry_run_query_failed", error: dErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const created: any[] = [];
  const skipped_dedupe: any[] = [];
  const skipped_no_mapping: any[] = [];
  const rejected_banned: any[] = [];
  const rejected_type: any[] = [];
  let inserted = 0;

  for (const d of dryRuns ?? []) {
    const draft = buildApproval(d as any);
    if (!draft) { skipped_no_mapping.push({ dry_run_id: d.id, dry_run_type: d.dry_run_type }); continue; }
    if (!ALLOWED_TYPES.has(draft.approval_type)) {
      rejected_type.push({ dry_run_id: d.id, approval_type: draft.approval_type });
      continue;
    }
    const banned = containsBanned(`${draft.approval_title} ${draft.approval_summary}`);
    if (banned) { rejected_banned.push({ dry_run_id: d.id, token: banned }); continue; }

    const dedupe_key = await sha256Hex(`${draft.source_dry_run_id}:${draft.approval_type}`);

    const insertRow = {
      ...draft,
      approval_status: "requested",
      requested_by_system: "vos-approval-curator-v1",
      would_execute: false,
      execution_blocked: true,
      dispatch_blocked: true,
      safety_blocked: true,
      approval_does_not_execute: true,
      dedupe_key,
    };

    const { data: ins, error: insErr } = await admin
      .from("vos_approval_requests")
      .insert(insertRow)
      .select("id, dedupe_key, approval_type")
      .maybeSingle();

    if (insErr) {
      if ((insErr as any).code === "23505" || /duplicate key/i.test(insErr.message)) {
        skipped_dedupe.push({ dry_run_id: d.id, dedupe_key, approval_type: draft.approval_type });
        continue;
      }
      return new Response(JSON.stringify({ ok: false, reason: "insert_failed", error: insErr.message, row: insertRow }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (ins) { inserted++; created.push(ins); }
  }

  return new Response(JSON.stringify({
    ok: true,
    notice: "Approval curator complete. Decision records only. NO execute. NO send. NO dispatch. NO outbound.",
    invariants: {
      would_execute: false,
      execution_blocked: true,
      dispatch_blocked: true,
      safety_blocked: true,
      approval_does_not_execute: true,
    },
    summary: {
      dry_runs_scanned: dryRuns?.length ?? 0,
      approvals_inserted: inserted,
      skipped_dedupe: skipped_dedupe.length,
      skipped_no_mapping: skipped_no_mapping.length,
      rejected_banned: rejected_banned.length,
      rejected_type: rejected_type.length,
    },
    created,
    skipped_dedupe,
    rejected_banned,
    rejected_type,
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
