// ============================================================
// SUITE BRIDGE — SPOKE (Phase B-2, drop-in, identical across all 4 sister apps)
// ============================================================
// Install path: supabase/functions/suite-bridge-spoke/index.ts
//
// PER-APP SETUP (only 3 things change per app):
//   1. Set APP_KEY below to one of:
//        "getwell_hub" | "getwell_grow" | "getwell_africa" | "mlm_course"
//   2. Add these secrets in the spoke project:
//        SUITE_BRIDGE_SECRET   (shared secret VantoOS holds for this app)
//        VANTOOS_HUB_URL       (e.g. https://zsvaqtlomgofwqkpwxeh.supabase.co)
//   3. Add to supabase/config.toml on the spoke:
//        [functions.suite-bridge-spoke]
//        verify_jwt = false
//
// WHAT'S NEW IN PHASE B-2:
//   - Handles `kind: "directive"` → stores it and posts a signed proposal back.
//   - Handles `kind: "snapshot_request"` → posts a signed snapshot back.
//   - Adds helper `postBackToHub()` that signs `${ts}.${nonce}.${APP_KEY}.${body}`.
//
// OPTIONAL (recommended) — create these tables on each spoke so directives/
// proposals/snapshots are auditable locally too. If they don't exist, the
// spoke still works; DB writes just silently no-op.
//
//   create table if not exists public.suite_bridge_directives (
//     id uuid primary key default gen_random_uuid(),
//     directive_id uuid not null,
//     title text, goal_text text, kpi_target jsonb, horizon_days int,
//     received_at timestamptz not null default now(),
//     responded_at timestamptz
//   );
//   create unique index if not exists suite_bridge_directives_uniq on public.suite_bridge_directives(directive_id);
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const APP_KEY = "getwell_grow";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-bridge-app, x-bridge-timestamp, x-bridge-nonce, x-bridge-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SIG_WINDOW_SECONDS = 300;
const enc = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------- Post back to the VantoOS hub (signed) ----------
async function postBackToHub(secret: string, hubUrl: string, body: Record<string, unknown>) {
  const bodyStr = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const sig = await hmacSha256Hex(secret, `${ts}.${nonce}.${APP_KEY}.${bodyStr}`);
  const target = new URL("/functions/v1/suite-bridge-hub", hubUrl).toString();
  const resp = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bridge-app": APP_KEY,
      "x-bridge-timestamp": ts,
      "x-bridge-nonce": nonce,
      "x-bridge-signature": sig,
    },
    // Hub's receive branch expects: { action:"receive", body:{...} }
    body: JSON.stringify({ action: "receive", body }),
  });
  return { status: resp.status, text: await resp.text() };
}

// ---------- Build a proposal from a directive (deterministic, safe) ----------
function draftProposalForDirective(dir: any) {
  return {
    kind: "proposal",
    directive_id: dir?.directive_id ?? null,
    title: `Proposal from ${APP_KEY} for: ${dir?.title ?? "directive"}`,
    summary: `Spoke ${APP_KEY} received directive "${dir?.title}". Proposed approach: analyse current KPIs against target ${JSON.stringify(dir?.kpi_target ?? {})} over ${dir?.horizon_days ?? "N/A"} days and report weekly. No action taken; awaiting hub review.`,
    proposed_actions: [
      { step: 1, label: "Baseline current metrics", owner: APP_KEY },
      { step: 2, label: "Draft weekly checkpoint plan", owner: APP_KEY },
      { step: 3, label: "Await hub approval before execution", owner: "hub" },
    ],
    confidence: "medium",
    generated_at: new Date().toISOString(),
  };
}

// ---------- Build a lightweight snapshot ----------
function buildSnapshot(directive_id: string | null) {
  return {
    kind: "snapshot",
    directive_id,
    app_key: APP_KEY,
    generated_at: new Date().toISOString(),
    health: { status: "ok", uptime_hint: "spoke_alive" },
    kpis: {
      // Replace these placeholders on each spoke with real numbers.
      active_users_hint: null,
      revenue_hint: null,
    },
    notes: "Baseline snapshot from spoke template. Replace kpis with real queries.",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("SUITE_BRIDGE_SECRET");
  const hubUrl = Deno.env.get("VANTOOS_HUB_URL");
  if (!secret) return json({ error: "spoke_missing_secret" }, 500);

  const senderApp = req.headers.get("x-bridge-app") ?? "";
  const ts = req.headers.get("x-bridge-timestamp") ?? "";
  const nonce = req.headers.get("x-bridge-nonce") ?? "";
  const sig = req.headers.get("x-bridge-signature") ?? "";

  if (!senderApp || !ts || !nonce || !sig) return json({ error: "missing_signature_headers" }, 400);
  if (senderApp !== "vantoos") return json({ error: "unexpected_sender" }, 401);
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(ts)) > SIG_WINDOW_SECONDS) {
    return json({ error: "stale_timestamp" }, 400);
  }

  const bodyStr = await req.text();
  const expected = await hmacSha256Hex(secret, `${ts}.${nonce}.${APP_KEY}.${bodyStr}`);
  if (!timingSafeEqual(sig, expected)) return json({ error: "bad_signature" }, 401);

  let body: any = {};
  try { body = JSON.parse(bodyStr || "{}"); } catch { /* keep {} */ }

  // ---- ping / pong (Phase A) ----
  if (body?.kind === "ping") {
    return json({ ok: true, app: APP_KEY, kind: "pong", ts: Date.now() });
  }

  // ---- directive → store locally, generate proposal, post back to hub ----
  if (body?.kind === "directive") {
    if (!hubUrl) return json({ error: "spoke_missing_hub_url" }, 500);

    // Best-effort local audit (silently no-ops if table doesn't exist).
    try {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await sb.from("suite_bridge_directives").upsert({
        directive_id: body.directive_id,
        title: body.title, goal_text: body.goal_text,
        kpi_target: body.kpi_target, horizon_days: body.horizon_days,
      }, { onConflict: "directive_id" });
    } catch { /* ignore */ }

    const proposal = draftProposalForDirective(body);
    let postResult: any = null;
    try {
      postResult = await postBackToHub(secret, hubUrl, proposal);
    } catch (e) {
      return json({ ok: false, app: APP_KEY, error: "post_back_failed", detail: String(e) }, 502);
    }
    return json({ ok: true, app: APP_KEY, received: "directive", posted_back: postResult });
  }

  // ---- snapshot_request → post a snapshot back to hub ----
  if (body?.kind === "snapshot_request") {
    if (!hubUrl) return json({ error: "spoke_missing_hub_url" }, 500);
    const snap = buildSnapshot(body?.directive_id ?? null);
    const postResult = await postBackToHub(secret, hubUrl, snap);
    return json({ ok: true, app: APP_KEY, sent: "snapshot", posted_back: postResult });
  }

  return json({ ok: true, app: APP_KEY, received: body?.kind ?? "unknown" });
});
