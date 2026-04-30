// Vanto OS — Step 4S Dry-Run Action Engine (admin-triggered, deterministic, INERT)
//
// Reads vos_proposal_queue (status != 'archived') and writes simulated previews
// to vos_dry_run_actions. Hard invariants enforced server-side:
//   would_execute=false, execution_blocked=true, dispatch_blocked=true, safety_blocked=true
//   only allowed dry_run_types
//   forbidden-verb scan on title/summary
//   dedupe by sha256(source_proposal_id + ':' + dry_run_type)
//
// NO outbound. NO send. NO consume. NO dispatcher invocation. NO external service.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APLGO_APP = "app_aplgo_mlm";
const HOST_APP = "app_vantoos_host";

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

type DryRunDraft = {
  source_proposal_id: string;
  app_id: string;
  event_name: string | null;
  dry_run_type: string;
  dry_run_title: string;
  dry_run_summary: string;
  simulated_target: string;
  simulated_payload_redacted: Record<string, unknown>;
};

// Pure deterministic mapper. No I/O. Closed allow-list.
export function buildDryRun(p: {
  id: string;
  app_id: string;
  event_name: string | null;
  proposal_type: string;
  proposal_status: string;
}): DryRunDraft | null {
  if (p.proposal_status === "archived") return null;

  if (p.app_id === APLGO_APP && p.proposal_type === "manual_review") {
    return {
      source_proposal_id: p.id,
      app_id: p.app_id,
      event_name: p.event_name,
      dry_run_type: "manual_review_preview",
      dry_run_title: "APLGO interest review preview",
      dry_run_summary: "This preview explains the interest signal only. No action taken.",
      simulated_target: "<<simulated:none>>",
      simulated_payload_redacted: { kind: "preview", channel: "<<simulated>>" },
    };
  }

  if (p.app_id === HOST_APP && p.proposal_type === "no_action_record") {
    return {
      source_proposal_id: p.id,
      app_id: p.app_id,
      event_name: p.event_name,
      dry_run_type: "no_action_preview",
      dry_run_title: "Host telemetry observation preview",
      dry_run_summary: "This preview confirms host telemetry only. No action taken.",
      simulated_target: "<<simulated:none>>",
      simulated_payload_redacted: { kind: "preview", channel: "<<simulated>>" },
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

  const { data: proposals, error: pErr } = await admin
    .from("vos_proposal_queue")
    .select("id, app_id, event_name, proposal_type, proposal_status")
    .neq("proposal_status", "archived")
    .order("created_at", { ascending: false })
    .limit(500);
  if (pErr) {
    return new Response(JSON.stringify({ ok: false, reason: "proposal_query_failed", error: pErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const created: any[] = [];
  const skipped_dedupe: any[] = [];
  const skipped_no_mapping: any[] = [];
  const rejected_banned: any[] = [];
  let inserted = 0;

  for (const p of proposals ?? []) {
    const draft = buildDryRun(p as any);
    if (!draft) { skipped_no_mapping.push({ id: p.id, app_id: p.app_id, proposal_type: p.proposal_type }); continue; }

    const banned = containsBanned(`${draft.dry_run_title} ${draft.dry_run_summary}`);
    if (banned) { rejected_banned.push({ proposal_id: p.id, token: banned }); continue; }

    const dedupe_key = await sha256Hex(`${draft.source_proposal_id}:${draft.dry_run_type}`);

    const insertRow = {
      ...draft,
      would_execute: false,
      execution_blocked: true,
      dispatch_blocked: true,
      safety_blocked: true,
      dry_run_status: "generated",
      created_by_system: "vos-dry-run-engine-v1",
      dedupe_key,
    };

    const { data: ins, error: insErr } = await admin
      .from("vos_dry_run_actions")
      .insert(insertRow)
      .select("id, dedupe_key, dry_run_type")
      .maybeSingle();

    if (insErr) {
      if ((insErr as any).code === "23505" || /duplicate key/i.test(insErr.message)) {
        skipped_dedupe.push({ proposal_id: p.id, dedupe_key, dry_run_type: draft.dry_run_type });
        continue;
      }
      return new Response(JSON.stringify({ ok: false, reason: "insert_failed", error: insErr.message, row: insertRow }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (ins) { inserted++; created.push(ins); }
  }

  return new Response(JSON.stringify({
    ok: true,
    notice: "Dry-run engine complete. Simulated previews only. NO execute. NO send. NO dispatch. NO outbound.",
    invariants: {
      would_execute: false,
      execution_blocked: true,
      dispatch_blocked: true,
      safety_blocked: true,
    },
    summary: {
      proposals_scanned: proposals?.length ?? 0,
      dry_runs_inserted: inserted,
      skipped_dedupe: skipped_dedupe.length,
      skipped_no_mapping: skipped_no_mapping.length,
      rejected_banned: rejected_banned.length,
    },
    created,
    skipped_dedupe,
    rejected_banned,
  }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
