// ============================================================
// SUITE BRIDGE — SPOKE (drop-in, identical across all 4 sister apps)
// ============================================================
// Install path: supabase/functions/suite-bridge-spoke/index.ts
//
// PER-APP SETUP (only 2 things change per app):
//   1. Set APP_KEY below to one of:
//        "getwell_hub" | "getwell_grow" | "getwell_africa" | "mlm_course"
//   2. Add ONE secret in the spoke project named exactly:
//        SUITE_BRIDGE_SECRET   (value = same shared secret VantoOS holds for this app)
//
// Then add to supabase/config.toml on the spoke:
//   [functions.suite-bridge-spoke]
//   verify_jwt = false
// ============================================================

const APP_KEY = "REPLACE_ME"; // <-- change this per app

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("SUITE_BRIDGE_SECRET");
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
  // NOTE: hub signs `${ts}.${nonce}.${TARGET_APP_KEY}.${body}` where TARGET_APP_KEY = this spoke.
  const expected = await hmacSha256Hex(secret, `${ts}.${nonce}.${APP_KEY}.${bodyStr}`);
  if (!timingSafeEqual(sig, expected)) return json({ error: "bad_signature" }, 401);

  let body: any = {};
  try { body = JSON.parse(bodyStr || "{}"); } catch { /* keep {} */ }

  // --- Phase A: bridge-only. Just echo a signed pong.
  if (body?.kind === "ping") {
    return json({ ok: true, app: APP_KEY, kind: "pong", ts: Date.now() });
  }

  // Phase B+ will branch on body.kind === "directive" | "snapshot_request" etc.
  return json({ ok: true, app: APP_KEY, received: body?.kind ?? "unknown" });
});
