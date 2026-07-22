// Maytapi Hub Self-Test — signs as a chosen spoke and runs T1–T6 against
// our own maytapi-hub-bridge. Proves the contract end-to-end without needing
// the spoke's deploy pipeline.
//
// POST { spoke?: "getwell_grow", phone?: "+27820000001" }

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HUB_URL = `${SUPABASE_URL}/functions/v1/maytapi-hub-bridge`;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const enc = new TextEncoder();

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callHub(app_key: string, secret: string, action: string, body: unknown) {
  const payload = JSON.stringify({ action, body });
  const ts = String(Date.now());
  const nonce = crypto.randomUUID();
  const sig = await hmacHex(secret, `${ts}.${nonce}.${app_key}.${payload}`);
  const t0 = Date.now();
  const resp = await fetch(HUB_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${ANON}`,
      "apikey": ANON,
      "x-bridge-app": app_key,
      "x-bridge-timestamp": ts,
      "x-bridge-nonce": nonce,
      "x-bridge-signature": sig,
    },
    body: payload,
  });
  const text = await resp.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { status: resp.status, latency_ms: Date.now() - t0, body: json ?? text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const params = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const spoke: string = params.spoke ?? "getwell_grow";
  const phone: string = params.phone ?? `+2782${String(Date.now()).slice(-7)}`;
  const mode: string = params.mode ?? "standard"; // "standard" | "activation"

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: app } = await sb.from("vos_suite_apps")
    .select("app_key,bridge_secret_slot,is_active").eq("app_key", spoke).maybeSingle();
  if (!app) {
    return new Response(JSON.stringify({ ok: false, error: `unknown_spoke:${spoke}` }),
      { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
  const secret = Deno.env.get(app.bridge_secret_slot) ?? "";
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: `secret_missing:${app.bridge_secret_slot}` }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }

  const results: any[] = [];
  const record = (name: string, expect: string, r: any) =>
    results.push({ test: name, expect, status: r.status, latency_ms: r.latency_ms, body: r.body });

  // T1 — ping
  record("T1_ping", "200 ok:true", await callHub(spoke, secret, "ping", {}));

  // T2 — dnc_check on fresh phone (no history) — expect allowed:true
  record("T2_dnc_check_fresh", "200 allowed:true",
    await callHub(spoke, secret, "dnc_check", { phone, event_class: "marketing" }));

  // T3 — dnc_check again immediately — still allowed:true (no send recorded yet)
  record("T3_dnc_check_repeat_no_send", "200 allowed:true",
    await callHub(spoke, secret, "dnc_check", { phone, event_class: "marketing" }));

  // T4 — send_recorded
  const spoke_event_id = `selftest-${crypto.randomUUID()}`;
  record("T4_send_recorded", "200 recorded:true",
    await callHub(spoke, secret, "send_recorded", {
      spoke_event_id, phone, campaign_type: "marketing:birthday",
      maytapi_message_id: `mt-${Date.now()}`, status: "sent",
    }));

  // T5 — dnc_check after send — expect cooldown block (marketing = 6h)
  record("T5_dnc_check_after_send", "200 allowed:false reason:cooldown blocked_until~+6h",
    await callHub(spoke, secret, "dnc_check", { phone, event_class: "marketing" }));

  // T6 — inbound_stop then dnc_check — expect dnc:stop_keyword
  record("T6a_inbound_stop", "200 dnc:true",
    await callHub(spoke, secret, "inbound_stop", { phone, keyword: "STOP" }));
  record("T6b_dnc_check_after_stop", "200 allowed:false reason:dnc:stop_keyword",
    await callHub(spoke, secret, "dnc_check", { phone, event_class: "marketing" }));

  // T7 — activation fan-out with email + tier (only when mode=activation)
  let activationEventId: string | null = null;
  if (mode === "activation") {
    const activationEventIdLocal = `selftest-activation-${crypto.randomUUID()}`;
    const activationPhone = params.activation_phone ?? `+2783${String(Date.now()).slice(-7)}`;
    const activationEmail = params.activation_email ?? `selftest+${Date.now()}@example.com`;
    const tier = params.tier ?? "champion";
    const r7 = await callHub(spoke, secret, "send_recorded", {
      spoke_event_id: activationEventIdLocal,
      phone: activationPhone,
      campaign_type: "activation",
      maytapi_message_id: `mt-activation-${Date.now()}`,
      status: "sent",
      metadata: {
        email: activationEmail,
        template_hint: `monthly_activity_thankyou_${tier}`,
        tier,
        tone: tier,
        contact: { first_name: "Selftest", email_address: activationEmail, aplgo_id: "APL-TEST", country: "ZA" },
      },
    });
    record("T7_activation_fanout", "200 recorded:true fanout.dispatched", r7);
    activationEventId = r7.body?.event_id ?? null;
  }

  // Verdict
  const pass = (i: number, cond: boolean) => ({ test: results[i].test, pass: cond });
  const b = (i: number) => results[i].body;
  const verdict = [
    pass(0, b(0)?.ok === true && results[0].status === 200),
    pass(1, results[1].status === 200 && b(1)?.allowed === true),
    pass(2, results[2].status === 200 && b(2)?.allowed === true),
    pass(3, results[3].status === 200 && b(3)?.recorded === true),
    pass(4, results[4].status === 200 && b(4)?.allowed === false && b(4)?.reason === "cooldown"),
    pass(5, results[5].status === 200 && b(5)?.dnc === true),
    pass(6, results[6].status === 200 && b(6)?.allowed === false && String(b(6)?.reason ?? "").startsWith("dnc:")),
  ];
  const overall = verdict.every((v) => v.pass) ? "CLEAN" : "HOLD";

  // Cleanup test artifacts so we don't pollute the mesh
  try {
    const { hexHash } = await (async () => {
      const salt = Deno.env.get("MAYTAPI_HASH_SALT") ?? "";
      const p = phone.replace(/[^\d+]/g, "").replace(/^00/, "+");
      const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${salt}.${p}`));
      return { hexHash: Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("") };
    })();
    await sb.from("suite_maytapi_events").delete().eq("phone_hash", hexHash);
    await sb.from("suite_maytapi_dnc").delete().eq("phone_hash", hexHash);
  } catch (_) { /* best effort */ }

  return new Response(JSON.stringify({
    ok: overall === "CLEAN", verdict: overall, spoke, phone_last4: phone.slice(-4),
    hub_url: HUB_URL, at: new Date().toISOString(), verdict_detail: verdict, results,
  }, null, 2), { status: 200, headers: { ...corsHeaders, "content-type": "application/json" } });
});
