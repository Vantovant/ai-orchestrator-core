// Vanto OS — Step 4O Level 2 Inbox-Only Receive (multi-app, registry-driven)
// NO DISPATCH. NO SEND. NO CONSUME. NO DOWNSTREAM ACTION.
// Apps + events are gated entirely by vos_app_registry + per-app Axis B flag + per-app receive kill-switch.
// Step 4O additions:
//   - app_id read from x-vos-app-id (no hardcoded ALLOWED_APP_ID)
//   - per-app Axis B flag map (app_aplgo_mlm, app_vantoos_host)
//   - global:* and app:* dispatch kill-switches DO NOT block inbox-only receive
//   - only inbox_receive:{app_id} blocks receive
// All responses include hard-coded would_dispatch=false, dispatch_blocked=true, downstream_action="none".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vos-signature, x-vos-timestamp, x-vos-app-id, x-vos-event",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REPLAY_WINDOW_SECONDS = 300;

// Per-app Axis B flag mapping. Add new apps here as they are approved for Level 2 receive.
const PER_APP_AXIS_B_FLAG: Record<string, string> = {
  app_aplgo_mlm: "VOS_INBOX_RECEIVE_APP_APLGO_ENABLED",
  app_vantoos_host: "VOS_INBOX_RECEIVE_APP_VANTOOS_HOST_ENABLED",
};

// Durable rate-limit thresholds
const PER_APP_LIMIT = 30;   // per 60s
const PER_IP_LIMIT = 60;    // per 60s
const FAILED_AUTH_LIMIT = 5; // per 300s lockout

// ─── Hard-coded no-dispatch invariant (response builder literals) ─────────────
function withInvariant(body: Record<string, unknown>) {
  return { ...body, would_dispatch: false, dispatch_blocked: true, downstream_action: "none" as const };
}

function jsonResp(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(withInvariant(body)), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function parseSignatureHeader(h: string | null): { version: string; hex: string } | null {
  if (!h) return null;
  const m = h.match(/^v(\d+)=([0-9a-f]+)$/i);
  return m ? { version: `v${m[1]}`, hex: m[2].toLowerCase() } : null;
}

// ─── PII redaction (mirrors vos-redact-packet, server-internal) ───────────────
const PATTERNS: Record<string, RegExp> = {
  sa_id: /\b\d{13}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  phone: /\b(?:\+?27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
  confidential_tag: /\[(?:CONFIDENTIAL|NDA|PRIVATE|SECRET)[^\]]*\]/gi,
  bank_account: /\b\d{8,12}\b/g,
};
const REPLACEMENTS: Record<string, string> = {
  sa_id: "[REDACTED_SA_ID]", email: "[REDACTED_EMAIL]", phone: "[REDACTED_PHONE]",
  confidential_tag: "[REDACTED_CONFIDENTIAL]", bank_account: "[REDACTED_BANK]",
};
function redactValue(v: any): any {
  if (typeof v === "string") {
    let out = v;
    for (const k of ["sa_id", "email", "phone", "confidential_tag", "bank_account"]) {
      out = out.replace(PATTERNS[k], REPLACEMENTS[k]);
    }
    return out;
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === "object") {
    const o: Record<string, any> = {};
    for (const [k, val] of Object.entries(v)) o[k] = redactValue(val);
    return o;
  }
  return v;
}
function buildSafeSummary(redacted: any, app: string, ev: string): string {
  const keys = redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? Object.keys(redacted).slice(0, 8).join(", ") : "scalar_payload";
  return `[${app}] ${ev} • fields: ${keys}`;
}

// ─── Durable rate limiter (Postgres-backed) ───────────────────────────────────
async function bumpAndCheck(
  admin: any,
  bucketType: "per_app" | "per_ip" | "failed_auth",
  scopeTarget: string,
  windowSeconds: number,
  limit: number,
): Promise<{ allowed: boolean; count: number }> {
  const nowMs = Date.now();
  const bucketMs = nowMs - (nowMs % (windowSeconds * 1000));
  const windowStart = new Date(bucketMs).toISOString();
  const bucketKey = `${bucketType}:${scopeTarget}:${windowStart}`;

  const { error: insErr } = await admin.from("vos_rate_limit_counters")
    .insert({ bucket_key: bucketKey, bucket_type: bucketType, scope_target: scopeTarget, window_start: windowStart, count: 1 });
  if (insErr) {
    const { data: row } = await admin.from("vos_rate_limit_counters")
      .select("id, count").eq("bucket_type", bucketType).eq("scope_target", scopeTarget).eq("window_start", windowStart).maybeSingle();
    if (row) {
      const newCount = (row.count ?? 0) + 1;
      await admin.from("vos_rate_limit_counters").update({ count: newCount, updated_at: new Date().toISOString() }).eq("id", row.id);
      return { allowed: newCount <= limit, count: newCount };
    }
    return { allowed: true, count: 1 };
  }
  return { allowed: 1 <= limit, count: 1 };
}

async function writeAudit(admin: any, row: Record<string, unknown>) {
  try { await admin.from("vos_inbox_receive_audit").insert(row); } catch (_) { /* swallow audit write errors */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { ok: false, reason: "method_not_allowed" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await sha256Hex(ip);

  const payloadString = await req.text();

  const sigHeader = req.headers.get("x-vos-signature");
  const tsHeader = req.headers.get("x-vos-timestamp");
  const appHeader = req.headers.get("x-vos-app-id");
  const eventHeader = req.headers.get("x-vos-event");

  const ts = Number(tsHeader);
  const dedupeKey = await sha256Hex(`${ts}.${payloadString}`);

  // ─── Per-IP rate limit ─────────────────────────────────────────────────────
  const ipRl = await bumpAndCheck(admin, "per_ip", ipHash, 60, PER_IP_LIMIT);
  if (!ipRl.allowed) {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, outcome: "rate_limited", reason: "per_ip", ip_hash: ipHash });
    return jsonResp(429, { ok: false, reason: "rate_limited", bucket: "per_ip" });
  }

  // ─── App identity must be known before flag/registry resolution ────────────
  if (!appHeader || !PER_APP_AXIS_B_FLAG[appHeader]) {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, outcome: "rejected_event", reason: "app_id_unknown_or_unsupported", ip_hash: ipHash });
    return jsonResp(400, { ok: false, reason: "app_id_not_allowed" });
  }
  const perAppFlagKey = PER_APP_AXIS_B_FLAG[appHeader];

  // ─── Flag gate (Axis B) — global + per-app ─────────────────────────────────
  const { data: flagRows } = await admin.from("vos_platform_flags")
    .select("flag_key, flag_value")
    .in("flag_key", ["VOS_INBOX_RECEIVE_ENABLED", perAppFlagKey]);
  const flags: Record<string, string> = {};
  for (const f of flagRows ?? []) flags[f.flag_key] = f.flag_value;
  const globalOn = flags["VOS_INBOX_RECEIVE_ENABLED"] === "true";
  const perAppOn = flags[perAppFlagKey] === "true";
  const flagGateClear = globalOn && perAppOn;

  if (!flagGateClear) {
    await writeAudit(admin, {
      app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey,
      flag_gate_clear: false, outcome: "rejected_flag",
      reason: `axis_b_disabled global=${globalOn} per_app=${perAppOn}`, ip_hash: ipHash,
    });
    return jsonResp(403, { ok: false, reason: "axis_b_disabled", flag_gate_clear: false });
  }

  // ─── Kill-switch (Axis B scope only) ───────────────────────────────────────
  // Axis A vs Axis B separation: ONLY inbox_receive:{app_id} blocks Level 2 receive.
  // global:* and app:{id} dispatch kill-switches MUST NOT block inbox-only receive.
  const { data: ksRows } = await admin.from("vos_kill_switches").select("scope, scope_target, state").eq("state", "engaged");
  const engaged = new Set<string>((ksRows ?? []).map((k: any) => `${k.scope}:${k.scope_target}`));
  const ksClearReceive = !engaged.has(`inbox_receive:${appHeader}`);
  if (!ksClearReceive) {
    await writeAudit(admin, {
      app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey,
      flag_gate_clear: true, kill_switch_clear: false,
      outcome: "rejected_kill_switch", reason: "inbox_receive_engaged", ip_hash: ipHash,
    });
    return jsonResp(403, { ok: false, reason: "kill_switch_engaged", kill_switch_clear: false });
  }

  // ─── Registry lookup (per-app) ─────────────────────────────────────────────
  const { data: appRow } = await admin.from("vos_app_registry")
    .select("app_key, owner_scope, app_status, public_key_ref, inbox_only_allowed, inbox_allowed_events")
    .eq("app_key", appHeader).maybeSingle();
  if (!appRow
      || appRow.owner_scope !== "vanto_admin_ecosystem"
      || appRow.app_status !== "design_only"
      || !appRow.inbox_only_allowed
      || appRow.app_status === "revoked") {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, event_allowed: false, outcome: "rejected_event", reason: "registry_disallowed", ip_hash: ipHash });
    return jsonResp(403, { ok: false, reason: "registry_disallowed" });
  }

  // ─── Event identity (driven entirely by registry per-app whitelist) ────────
  const allowedEvents: string[] = (appRow.inbox_allowed_events ?? []) as string[];
  if (!eventHeader || !allowedEvents.includes(eventHeader)) {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, event_allowed: false, outcome: "rejected_event", reason: "event_name_mismatch", ip_hash: ipHash });
    return jsonResp(400, { ok: false, reason: "event_name_not_allowed", event_allowed: false });
  }

  // ─── Timestamp window ──────────────────────────────────────────────────────
  if (!Number.isFinite(ts)) {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, outcome: "rejected_signature", reason: "missing_timestamp", ip_hash: ipHash });
    return jsonResp(400, { ok: false, reason: "missing_or_invalid_timestamp" });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - ts) > REPLAY_WINDOW_SECONDS) {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, outcome: "rejected_signature", reason: "timestamp_outside_window", ip_hash: ipHash });
    return jsonResp(400, { ok: false, reason: "timestamp_outside_window" });
  }

  // ─── Idempotency: short-circuit on dedupe_key hit ─────────────────────────
  const { data: existing } = await admin.from("vos_signed_inbox")
    .select("id").eq("app_id", appHeader).eq("dedupe_key", dedupeKey).maybeSingle();
  if (existing) {
    await writeAudit(admin, {
      app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey,
      flag_gate_clear: true, kill_switch_clear: true, event_allowed: true,
      outcome: "deduped", reason: "duplicate_dedupe_key", ip_hash: ipHash,
    });
    return jsonResp(200, { ok: true, accepted: true, deduped: true, persisted: false });
  }

  // ─── Per-app durable rate limit ────────────────────────────────────────────
  const appRl = await bumpAndCheck(admin, "per_app", appHeader, 60, PER_APP_LIMIT);
  if (!appRl.allowed) {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, outcome: "rate_limited", reason: "per_app", ip_hash: ipHash });
    return jsonResp(429, { ok: false, reason: "rate_limited", bucket: "per_app" });
  }

  // ─── Signature verify ──────────────────────────────────────────────────────
  const parsed = parseSignatureHeader(sigHeader);
  if (!parsed) {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, signature_valid: false, outcome: "rejected_signature", reason: "missing_or_invalid_signature_format", ip_hash: ipHash });
    return jsonResp(400, { ok: false, reason: "missing_or_invalid_signature_format" });
  }

  const secretRef = appRow.public_key_ref; // legacy column name; semantically hmac_secret_ref
  const secretValue = secretRef ? Deno.env.get(secretRef) : undefined;
  if (!secretValue) {
    await writeAudit(admin, { app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey, signature_valid: false, outcome: "rejected_signature", reason: "no_secret_resolved", ip_hash: ipHash });
    return jsonResp(500, { ok: false, reason: "no_secret_resolved" });
  }

  const expectedHex = await hmacSha256Hex(secretValue, `${ts}.${payloadString}`);
  const sigValid = timingSafeEqual(hexToBytes(expectedHex), hexToBytes(parsed.hex));
  const fpBuf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secretValue));
  const fingerprintPrefix = Array.from(new Uint8Array(fpBuf)).slice(0, 4).map((b) => b.toString(16).padStart(2, "0")).join("");

  if (!sigValid) {
    await bumpAndCheck(admin, "failed_auth", `${appHeader}:${ipHash}`, 300, FAILED_AUTH_LIMIT);
    await writeAudit(admin, {
      app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey,
      signature_valid: false, fingerprint_prefix: fingerprintPrefix,
      outcome: "rejected_signature", reason: "hmac_mismatch", ip_hash: ipHash,
    });
    return jsonResp(401, { ok: false, reason: "signature_invalid", signature_valid: false });
  }

  // ─── Parse + redact ────────────────────────────────────────────────────────
  let parsedPayload: any = {};
  try { parsedPayload = payloadString ? JSON.parse(payloadString) : {}; } catch { parsedPayload = { _raw: "[unparseable]" }; }
  const redacted = redactValue(parsedPayload);
  const safeSummary = buildSafeSummary(redacted, appHeader, eventHeader);

  // ─── Persist (only redacted) ───────────────────────────────────────────────
  const { error: insertErr } = await admin.from("vos_signed_inbox").insert({
    app_id: appHeader,
    source_app: appHeader,
    event_name: eventHeader,
    ts,
    dedupe_key: dedupeKey,
    fingerprint_prefix: fingerprintPrefix,
    signature_header: sigHeader,
    signature: parsed.hex,
    signature_version: parsed.version,
    idempotency_key: dedupeKey,
    payload: {}, // raw NOT stored — empty placeholder; legacy NOT NULL column
    redacted_payload: redacted,
    safe_summary: safeSummary,
    processing_state: "received_inbox_only",
  });

  if (insertErr) {
    if (String(insertErr.message ?? "").toLowerCase().includes("duplicate") || String(insertErr.code ?? "") === "23505") {
      await writeAudit(admin, {
        app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey,
        signature_valid: true, fingerprint_prefix: fingerprintPrefix,
        flag_gate_clear: true, kill_switch_clear: true, event_allowed: true,
        outcome: "deduped", reason: "race_unique_violation", ip_hash: ipHash,
      });
      return jsonResp(200, { ok: true, accepted: true, deduped: true, persisted: false });
    }
    await writeAudit(admin, {
      app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey,
      signature_valid: true, fingerprint_prefix: fingerprintPrefix,
      outcome: "rejected_signature", reason: `insert_failed:${insertErr.message}`, ip_hash: ipHash,
    });
    return jsonResp(500, { ok: false, reason: "persist_failed" });
  }

  await writeAudit(admin, {
    app_id: appHeader, event_name: eventHeader, dedupe_key: dedupeKey,
    signature_valid: true, fingerprint_prefix: fingerprintPrefix,
    flag_gate_clear: true, kill_switch_clear: true, event_allowed: true,
    outcome: "persisted", reason: "ok", ip_hash: ipHash,
  });

  return jsonResp(200, {
    ok: true, accepted: true, persisted: true, deduped: false,
    app_id: appHeader, event_name: eventHeader,
    fingerprint_prefix: fingerprintPrefix,
    signature_valid: true,
    notice: "Step 4O Level 2 inbox-only receive (multi-app). Stored redacted only. NO dispatch. NO send. NO consume.",
  });
});
