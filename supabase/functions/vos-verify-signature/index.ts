// Vanto OS — HMAC Signature Verifier (verify-only)
// Phase 1 Step 2. NO dispatch. NO live traffic. NO real secrets.
// Validates: HMAC-SHA256 signature + timestamp window (replay protection).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes
// Test-only placeholder secret. Real per-app secrets are NOT provisioned in Phase 1.
const TEST_PLACEHOLDER_SECRET = "phase1-test-only-not-a-real-secret";

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
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseSignatureHeader(header: string | null): { version: string; hex: string } | null {
  if (!header) return null;
  // Format: "v1=abcdef..."
  const m = header.match(/^v(\d+)=([0-9a-f]+)$/i);
  if (!m) return null;
  return { version: `v${m[1]}`, hex: m[2].toLowerCase() };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      payload_string,
      signature_header,
      timestamp,
      secret_override, // test-only override; never used in production
    } = body ?? {};

    const checks = {
      has_payload: !!payload_string,
      has_signature: false,
      signature_format_valid: false,
      timestamp_present: !!timestamp,
      timestamp_within_window: false,
      signature_valid: false,
    };

    if (!payload_string || typeof payload_string !== "string") {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_payload_string", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const parsed = parseSignatureHeader(signature_header);
    checks.has_signature = !!signature_header;
    checks.signature_format_valid = !!parsed;
    if (!parsed) {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_or_invalid_signature_format", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Timestamp / replay window
    const ts = Number(timestamp);
    if (Number.isFinite(ts)) {
      const nowSec = Math.floor(Date.now() / 1000);
      checks.timestamp_within_window = Math.abs(nowSec - ts) <= REPLAY_WINDOW_SECONDS;
    }
    if (!checks.timestamp_within_window) {
      return new Response(
        JSON.stringify({ ok: false, reason: "timestamp_outside_window", checks }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Compute expected signature using TEST placeholder (no real keys provisioned).
    const secret = typeof secret_override === "string" && secret_override.length > 0
      ? secret_override
      : TEST_PLACEHOLDER_SECRET;
    const signedBody = `${ts}.${payload_string}`;
    const expectedHex = await hmacSha256Hex(secret, signedBody);
    checks.signature_valid = timingSafeEqual(hexToBytes(expectedHex), hexToBytes(parsed.hex));

    return new Response(
      JSON.stringify({
        ok: checks.signature_valid,
        version: parsed.version,
        checks,
        notice: "Phase 1 verifier. No live keys. No dispatch.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, reason: "exception", error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
