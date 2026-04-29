// Path A: Inbound-only Facebook lead webhook.
// - Verifies Meta signature when META_APP_SECRET is present.
// - Inserts into public.lead_inbox via service role.
// - Logs inbound audit to vos_inbound_log.
// - Never sends WhatsApp/email, never enrolls contacts, never triggers outbound.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const META_APP_SECRET = Deno.env.get("META_APP_SECRET");
const META_VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN");

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function verifyMetaSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!META_APP_SECRET) return false;
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = header.slice(7);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(META_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function extractFields(payload: any) {
  // Tolerant extraction across Meta lead-ad shapes and simple test payloads.
  const lead = payload?.entry?.[0]?.changes?.[0]?.value ?? payload?.lead ?? payload ?? {};
  const fieldData: any[] = lead?.field_data ?? payload?.field_data ?? [];
  const map: Record<string, string> = {};
  for (const f of fieldData) {
    if (f?.name && Array.isArray(f?.values) && f.values.length) map[f.name] = String(f.values[0]);
  }
  return {
    lead_name: payload.lead_name ?? map.full_name ?? map.name ?? lead.full_name ?? null,
    phone: payload.phone ?? map.phone_number ?? map.phone ?? lead.phone ?? null,
    email: payload.email ?? map.email ?? lead.email ?? null,
    source_campaign: payload.source_campaign ?? lead.campaign_name ?? lead.ad_name ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Meta GET verification handshake
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && META_VERIFY_TOKEN && token === META_VERIFY_TOKEN) {
      return new Response(challenge ?? "", { headers: corsHeaders, status: 200 });
    }
    return new Response("forbidden", { headers: corsHeaders, status: 403 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405,
    });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256");
  const isTest = req.headers.get("x-vos-test") === "1";

  let signatureValid = false;
  let outcome = "accepted";

  if (META_APP_SECRET) {
    signatureValid = await verifyMetaSignature(rawBody, sigHeader);
    if (!signatureValid && !isTest) {
      await sb.from("vos_inbound_log").insert({
        source_app: "facebook_ad",
        event_name: "lead_webhook",
        signature_valid: false,
        outcome: "rejected_bad_signature",
        detail: { reason: "invalid_meta_signature" },
      });
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401,
      });
    }
  } else if (!isTest) {
    // No secret configured AND not an explicit test → HOLD
    return new Response(JSON.stringify({
      status: "HOLD",
      reason: "META_APP_SECRET not configured. Add it as a Supabase secret to enable signature verification.",
      required_secret: "META_APP_SECRET",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 });
  }

  let payload: any = {};
  try { payload = rawBody ? JSON.parse(rawBody) : {}; } catch {
    outcome = "rejected_bad_json";
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }

  const fields = extractFields(payload);

  const { data: inserted, error: insErr } = await sb.from("lead_inbox").insert({
    source: "facebook_ad",
    source_campaign: fields.source_campaign,
    lead_name: fields.lead_name,
    phone: fields.phone,
    email: fields.email,
    raw_payload: payload,
    status: "new",
    tags: ["source:facebook_ad", ...(isTest ? ["test"] : [])],
  }).select("id").single();

  if (insErr) {
    await sb.from("vos_inbound_log").insert({
      source_app: "facebook_ad", event_name: "lead_webhook",
      signature_valid: signatureValid, outcome: "insert_failed",
      detail: { error: insErr.message },
    });
    return new Response(JSON.stringify({ error: "insert_failed", detail: insErr.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }

  await sb.from("vos_inbound_log").insert({
    source_app: "facebook_ad",
    event_name: "lead_webhook",
    signature_valid: signatureValid,
    outcome,
    idempotency_key: inserted?.id ?? null,
    detail: { lead_id: inserted?.id, is_test: isTest, has_secret: !!META_APP_SECRET },
  });

  return new Response(JSON.stringify({ status: "captured", lead_id: inserted?.id, signature_valid: signatureValid }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
  });
});
