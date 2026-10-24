// GPS ingest for OwnTracks (HTTP mode) and a normalized batch format.
// Auth: per-device secret as Basic-auth password or x-device-token header.
// Never accepted in the query string. Only a SHA-256 hash is stored.
// Never log tokens or coordinates from this function.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { fingerprintInput, MAX_BODY_BYTES, parsePayload } from "../_shared/location-detect.ts";
import { processTrip } from "../_shared/location-process.ts";

const RATE_LIMIT_PER_MIN = 120;
const PROCESS_DEBOUNCE_MS = 60_000;

const headers = { ...corsHeaders, "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractToken(req: Request): string | null {
  const h = req.headers.get("x-device-token");
  if (h && h.trim()) return h.trim();
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(auth.slice(6).trim());
      const idx = decoded.indexOf(":");
      const pass = idx >= 0 ? decoded.slice(idx + 1) : "";
      return pass || null;
    } catch { return null; }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  for (const k of ["token", "key", "secret", "password", "device_token"]) {
    if (url.searchParams.has(k)) return reply({ ok: false, error: "token_in_query_string_refused" }, 400);
  }

  const token = extractToken(req);
  if (!token || token.length < 20 || token.length > 200) return reply({ ok: false, error: "unauthorized" }, 401);

  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return reply({ ok: false, error: "payload_too_large" }, 413);
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply({ ok: false, error: "payload_too_large" }, 413);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const hash = await sha256Hex(token);
  const { data: device } = await admin.from("location_devices")
    .select("id, user_id, token_hash, enabled, revoked_at, rate_window_start, rate_count")
    .eq("token_hash", hash).maybeSingle();
  if (!device || !timingSafeEqual(device.token_hash, hash) || !device.enabled || device.revoked_at) {
    return reply({ ok: false, error: "unauthorized" }, 401);
  }

  // Per-device rate limit (fixed 1-minute window).
  const now = Date.now();
  const winStart = device.rate_window_start ? Date.parse(device.rate_window_start) : 0;
  const inWindow = now - winStart < 60_000;
  const count = inWindow ? device.rate_count + 1 : 1;
  if (inWindow && count > RATE_LIMIT_PER_MIN) return reply({ ok: false, error: "rate_limited" }, 429);
  await admin.from("location_devices").update({
    rate_window_start: inWindow ? device.rate_window_start : new Date(now).toISOString(),
    rate_count: count, last_seen_at: new Date(now).toISOString(),
  }).eq("id", device.id);

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return reply({ ok: false, error: "invalid_json" }, 400); }
  const parsed = parsePayload(body, now);
  if (parsed.format === "unknown") return reply({ ok: false, error: "unrecognized_payload" }, 400);

  // Trip matching: only when exactly one active tracking session for this
  // user + device covers the fix time. Otherwise trip_id stays null.
  const { data: sessions } = await admin.from("trip_tracking_sessions")
    .select("trip_id, actual_started_at, actual_ended_at")
    .eq("user_id", device.user_id).eq("device_id", device.id).eq("status", "active");
  const tripFor = (iso: string): string | null => {
    const t = Date.parse(iso);
    const eligible = (sessions ?? []).filter((s: any) =>
      Date.parse(s.actual_started_at) <= t && (!s.actual_ended_at || Date.parse(s.actual_ended_at) >= t));
    const ids = new Set(eligible.map((s: any) => s.trip_id));
    return ids.size === 1 ? [...ids][0] as string : null;
  };

  const rows = [];
  for (const e of parsed.events) {
    const fp = await sha256Hex(e.source_event_id ? `e:${e.source_event_id}` : `p:${fingerprintInput(e)}`);
    rows.push({
      user_id: device.user_id, device_id: device.id, trip_id: tripFor(e.recorded_at),
      recorded_at: e.recorded_at, latitude: e.latitude, longitude: e.longitude,
      accuracy_m: e.accuracy_m, speed_kmh: e.speed_kmh, heading_deg: e.heading_deg, altitude_m: e.altitude_m,
      source: e.source, source_event_id: e.source_event_id, dedupe_fingerprint: fp,
      payload_version: e.payload_version,
      quality_status: e.accuracy_m !== null && e.accuracy_m > 100 ? "low_accuracy" : "accepted",
    });
  }

  let accepted = 0;
  const touchedTrips = new Set<string>();
  if (rows.length) {
    const { data: ins, error } = await admin.from("trip_location_points")
      .upsert(rows, { onConflict: "device_id,dedupe_fingerprint", ignoreDuplicates: true })
      .select("trip_id");
    if (error) {
      console.error("location-ingest insert failed", { code: error.code }); // no payload in logs
      return reply({ ok: false, error: "store_failed" }, 500);
    }
    accepted = ins?.length ?? 0;
    for (const r of ins ?? []) if (r.trip_id) touchedTrips.add(r.trip_id);
  }
  const duplicates = rows.length - accepted;

  if (touchedTrips.size) {
    const work = (async () => {
      for (const tripId of touchedTrips) {
        const { data: last } = await admin.from("location_processing_runs").select("started_at")
          .eq("trip_id", tripId).order("started_at", { ascending: false }).limit(1).maybeSingle();
        if (last && Date.now() - Date.parse(last.started_at) < PROCESS_DEBOUNCE_MS) continue;
        await processTrip(admin, device.user_id, tripId);
      }
    })();
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(work); else await work;
  }

  // OwnTracks expects a JSON array (commands to the phone); none are sent.
  if (parsed.format === "owntracks") return reply([]);
  return reply({ ok: true, accepted, duplicates, rejected: parsed.rejected.length, rejections: parsed.rejected });
});
