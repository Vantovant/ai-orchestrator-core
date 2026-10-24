// GPS Trip Logger — pure, dependency-free logic shared by the location-ingest /
// location-process edge functions, the MCP tools and the web app (and its tests).
// Keep this file free of Deno / npm imports so every runtime can load it.

export const DETECTION_VERSION = "stops-v1";

// ---- Tunables ------------------------------------------------------------
export const LOW_ACCURACY_M = 100;           // fixes worse than this are "low_accuracy"
export const SUSPECT_SPEED_KMH = 250;        // implied ground speed above this (without a gap) = "suspect"
export const GAP_SECONDS = 600;              // >10 min between reliable fixes = missing interval
export const STOP_RADIUS_M = 100;            // stop cluster radius before accuracy padding
export const STOP_MIN_SECONDS = 300;         // 5 minutes
export const FLIGHT_SPEED_KMH = 300;         // a leg faster than this is a flight, never a car leg
export const MAX_BATCH = 500;
export const MAX_BODY_BYTES = 256 * 1024;

// Clock-skew policy: device timestamps more than 10 minutes in the future
// are rejected (bad clock); older than 30 days are rejected as implausible
// for live capture (bulk history should come through manual_import later).
export const MAX_FUTURE_SKEW_MS = 10 * 60 * 1000;
export const MAX_PAST_AGE_MS = 30 * 24 * 3600 * 1000;

export type Source = "owntracks" | "tasker" | "manual_import";

export interface NormalizedEvent {
  source_event_id: string | null;
  recorded_at: string; // ISO UTC
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_kmh: number | null;
  heading_deg: number | null;
  altitude_m: number | null;
  source: Source;
  payload_version: string;
}

export interface Rejection { index: number; reason: string }

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export function validateEvent(e: NormalizedEvent, nowMs: number): string | null {
  if (!Number.isFinite(e.latitude) || e.latitude < -90 || e.latitude > 90) return "invalid_latitude";
  if (!Number.isFinite(e.longitude) || e.longitude < -180 || e.longitude > 180) return "invalid_longitude";
  if (e.latitude === 0 && e.longitude === 0) return "null_island";
  const t = Date.parse(e.recorded_at);
  if (!Number.isFinite(t)) return "invalid_timestamp";
  if (t > nowMs + MAX_FUTURE_SKEW_MS) return "timestamp_in_future";
  if (t < nowMs - MAX_PAST_AGE_MS) return "timestamp_too_old";
  if (e.accuracy_m !== null && e.accuracy_m < 0) return "invalid_accuracy";
  if (e.speed_kmh !== null && e.speed_kmh < 0) return "invalid_speed";
  return null;
}

/** Parses an OwnTracks HTTP body (object or array) or the normalized format. */
export function parsePayload(body: unknown, nowMs: number): {
  format: "owntracks" | "normalized" | "unknown";
  events: NormalizedEvent[];
  rejected: Rejection[];
  ignored: number;
} {
  const events: NormalizedEvent[] = [];
  const rejected: Rejection[] = [];
  let ignored = 0;

  if (body && typeof body === "object" && !Array.isArray(body) && Array.isArray((body as any).events)) {
    const list = (body as any).events as unknown[];
    const version = String((body as any).schema_version ?? "1");
    if (list.length > MAX_BATCH) return { format: "normalized", events: [], rejected: [{ index: -1, reason: "batch_too_large" }], ignored };
    list.forEach((raw: any, index) => {
      const lat = num(raw?.latitude), lon = num(raw?.longitude);
      const rec = typeof raw?.recorded_at === "string" ? raw.recorded_at : null;
      if (lat === null || lon === null || !rec) { rejected.push({ index, reason: "missing_fields" }); return; }
      const iso = Number.isFinite(Date.parse(rec)) ? new Date(Date.parse(rec)).toISOString() : rec;
      const src = ["owntracks", "tasker", "manual_import"].includes(raw?.source) ? raw.source : "tasker";
      const ev: NormalizedEvent = {
        source_event_id: raw?.source_event_id != null ? String(raw.source_event_id).slice(0, 200) : null,
        recorded_at: iso, latitude: lat, longitude: lon,
        accuracy_m: num(raw?.accuracy_m), speed_kmh: num(raw?.speed_kmh),
        heading_deg: num(raw?.heading_deg), altitude_m: num(raw?.altitude_m),
        source: src, payload_version: `normalized-${version}`,
      };
      const why = validateEvent(ev, nowMs);
      if (why) rejected.push({ index, reason: why }); else events.push(ev);
    });
    return { format: "normalized", events, rejected, ignored };
  }

  const list = Array.isArray(body) ? body : body && typeof body === "object" ? [body] : null;
  if (!list) return { format: "unknown", events, rejected: [{ index: -1, reason: "unrecognized_payload" }], ignored };
  if (list.length > MAX_BATCH) return { format: "owntracks", events: [], rejected: [{ index: -1, reason: "batch_too_large" }], ignored };
  list.forEach((raw: any, index) => {
    if (raw?._type !== "location") { ignored++; return; } // waypoints, transitions, lwt, etc.
    const lat = num(raw.lat), lon = num(raw.lon), tst = num(raw.tst);
    if (lat === null || lon === null || tst === null) { rejected.push({ index, reason: "missing_fields" }); return; }
    const recorded_at = new Date(tst * 1000).toISOString(); // tst = epoch seconds, UTC
    const ev: NormalizedEvent = {
      // OwnTracks has no event id; tid+tst identifies a fix from one device.
      source_event_id: `${raw.tid ?? "ot"}:${tst}`,
      recorded_at, latitude: lat, longitude: lon,
      accuracy_m: num(raw.acc), speed_kmh: num(raw.vel), // OwnTracks vel is km/h
      heading_deg: num(raw.cog), altitude_m: num(raw.alt),
      source: "owntracks", payload_version: "owntracks-http",
    };
    const why = validateEvent(ev, nowMs);
    if (why) rejected.push({ index, reason: why }); else events.push(ev);
  });
  return { format: "owntracks", events, rejected, ignored };
}

/** Deterministic dedupe input (hashed by the caller) when no event id exists. */
export function fingerprintInput(e: Pick<NormalizedEvent, "recorded_at" | "latitude" | "longitude">): string {
  return `${new Date(e.recorded_at).toISOString()}|${e.latitude.toFixed(6)}|${e.longitude.toFixed(6)}`;
}

// ---- Geometry -----------------------------------------------------------
export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Pt {
  id?: string;
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  speed_kmh?: number | null;
  quality_status?: string;
}

const ms = (p: Pt) => Date.parse(p.recorded_at);

export function sortPoints<T extends Pt>(points: T[]): T[] {
  return [...points].sort((a, b) => ms(a) - ms(b));
}

/** Quality per point: accepted | low_accuracy | suspect (impossible jump without a gap). */
export function classifyQuality<T extends Pt>(points: T[]): (T & { quality_status: string })[] {
  const sorted = sortPoints(points);
  const out: (T & { quality_status: string })[] = [];
  let lastGood: T | null = null;
  for (const p of sorted) {
    let q = "accepted";
    if (p.accuracy_m !== null && p.accuracy_m > LOW_ACCURACY_M) q = "low_accuracy";
    else if (lastGood) {
      const dt = (ms(p) - ms(lastGood)) / 1000;
      const d = haversineM(lastGood.latitude, lastGood.longitude, p.latitude, p.longitude);
      if (dt > 0 && dt < GAP_SECONDS && (d / dt) * 3.6 > SUSPECT_SPEED_KMH) q = "suspect";
      if (dt <= 0 && d > 50) q = "suspect";
    }
    if (q === "accepted") lastGood = p;
    out.push({ ...p, quality_status: q });
  }
  return out;
}

export interface Gap { from: string; to: string; seconds: number }

export function findGaps(reliable: Pt[]): Gap[] {
  const gaps: Gap[] = [];
  for (let i = 1; i < reliable.length; i++) {
    const s = (ms(reliable[i]) - ms(reliable[i - 1])) / 1000;
    if (s > GAP_SECONDS) gaps.push({ from: reliable[i - 1].recorded_at, to: reliable[i].recorded_at, seconds: Math.round(s) });
  }
  return gaps;
}

/** Observed polylines split at gaps — never connect across a missing interval. */
export function routeSegments(reliable: Pt[]): Pt[][] {
  const segs: Pt[][] = [];
  let cur: Pt[] = [];
  for (let i = 0; i < reliable.length; i++) {
    if (i > 0 && (ms(reliable[i]) - ms(reliable[i - 1])) / 1000 > GAP_SECONDS) { if (cur.length) segs.push(cur); cur = []; }
    cur.push(reliable[i]);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

export interface DetectedStop {
  seq: number;
  arrival_at: string;
  arrival_uncertainty_seconds: number;
  departure_at: string | null;           // null = departure not observed (unknown)
  departure_uncertainty_seconds: number;
  dwell_seconds: number | null;          // observed lower bound; null when departure unknown
  centroid_lat: number;
  centroid_lon: number;
  radius_m: number;
  mean_accuracy_m: number | null;
  point_count: number;
  confidence: number;
}

export interface DetectedLeg {
  seq: number;
  from_seq: number;
  to_seq: number;
  started_at: string;
  ended_at: string;
  actual_seconds: number;
  observed_distance_km: number;
  straight_line_km: number;
  travel_mode: "ground" | "flight" | "unknown";
  missing_intervals: Gap[];
  coverage_ratio: number;
  confidence: number;
}

function centroid(pts: Pt[]) {
  const lat = pts.reduce((s, p) => s + p.latitude, 0) / pts.length;
  const lon = pts.reduce((s, p) => s + p.longitude, 0) / pts.length;
  return { lat, lon };
}

/**
 * Stop detection. A stop = reliable fixes staying within ~100 m (+ accuracy
 * padding) for >= 5 min. Leaving needs two consecutive outside fixes
 * ("sustained movement"), so a single GPS drift spike never splits a stop or
 * creates a drive. Gaps at a boundary become uncertainty intervals.
 */
export function detectStops(points: Pt[]): { stops: DetectedStop[]; reliable: Pt[]; gaps: Gap[] } {
  const reliable = classifyQuality(points).filter((p) => p.quality_status === "accepted");
  const gaps = findGaps(reliable);
  const stops: DetectedStop[] = [];
  let i = 0;
  while (i < reliable.length) {
    const cluster: Pt[] = [reliable[i]];
    let j = i + 1;
    let exitedAt = -1;
    while (j < reliable.length) {
      const c = centroid(cluster);
      const pad = (p: Pt) => Math.min(p.accuracy_m ?? 0, 50);
      const inside = (p: Pt) => haversineM(c.lat, c.lon, p.latitude, p.longitude) <= STOP_RADIUS_M + pad(p);
      if (inside(reliable[j])) { cluster.push(reliable[j]); j++; continue; }
      const next = reliable[j + 1];
      if (next && inside(next)) { j++; continue; } // single drift spike: skip, stay in stop
      exitedAt = j;
      break;
    }
    const first = cluster[0], last = cluster[cluster.length - 1];
    const dur = (ms(last) - ms(first)) / 1000;
    if (cluster.length >= 2 && dur >= STOP_MIN_SECONDS) {
      const c = centroid(cluster);
      const radius = Math.max(...cluster.map((p) => haversineM(c.lat, c.lon, p.latitude, p.longitude)));
      const accs = cluster.map((p) => p.accuracy_m).filter((a): a is number => a !== null);
      const meanAcc = accs.length ? accs.reduce((s, a) => s + a, 0) / accs.length : null;

      // Arrival: if the fix before the cluster is separated by a gap, arrival lies in that interval.
      const prev = reliable[i - 1];
      const arrGap = prev ? (ms(first) - ms(prev)) / 1000 : 0;
      const arrival_uncertainty_seconds = prev && arrGap > GAP_SECONDS ? Math.round(arrGap) : 0;

      let departure_at: string | null = null;
      let departure_uncertainty_seconds = 0;
      if (exitedAt >= 0) {
        departure_at = last.recorded_at; // last reliable fix before sustained movement
        const depGap = (ms(reliable[exitedAt]) - ms(last)) / 1000;
        if (depGap > GAP_SECONDS) departure_uncertainty_seconds = Math.round(depGap);
      }
      const innerGap = gaps.some((g) => Date.parse(g.from) >= ms(first) && Date.parse(g.to) <= ms(last));

      let conf = 0.9;
      if (innerGap) conf -= 0.2;
      if (arrival_uncertainty_seconds || departure_uncertainty_seconds) conf -= 0.25;
      if (meanAcc !== null && meanAcc > 50) conf -= 0.15;
      if (cluster.length < 4) conf -= 0.2;
      if (!departure_at) conf -= 0.1;
      stops.push({
        seq: stops.length + 1,
        arrival_at: first.recorded_at, arrival_uncertainty_seconds,
        departure_at, departure_uncertainty_seconds,
        dwell_seconds: departure_at ? Math.round(dur) : null,
        centroid_lat: c.lat, centroid_lon: c.lon, radius_m: Math.round(radius),
        mean_accuracy_m: meanAcc === null ? null : Math.round(meanAcc),
        point_count: cluster.length,
        confidence: Math.max(0.1, Math.min(0.95, Number(conf.toFixed(2)))),
      });
      i = exitedAt >= 0 ? exitedAt : reliable.length;
    } else {
      i++;
    }
  }
  return { stops, reliable, gaps };
}

export function detectLegs(stops: DetectedStop[], reliable: Pt[], gaps: Gap[]): DetectedLeg[] {
  const legs: DetectedLeg[] = [];
  for (let k = 1; k < stops.length; k++) {
    const a = stops[k - 1], b = stops[k];
    if (!a.departure_at) continue;
    const t0 = Date.parse(a.departure_at), t1 = Date.parse(b.arrival_at);
    const secs = Math.max(0, Math.round((t1 - t0) / 1000));
    const pts = reliable.filter((p) => ms(p) >= t0 && ms(p) <= t1);
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      if ((ms(pts[i]) - ms(pts[i - 1])) / 1000 > GAP_SECONDS) continue; // never measure across a gap
      dist += haversineM(pts[i - 1].latitude, pts[i - 1].longitude, pts[i].latitude, pts[i].longitude);
    }
    const missing = gaps.filter((g) => Date.parse(g.from) >= t0 && Date.parse(g.to) <= t1);
    const missingSecs = missing.reduce((s, g) => s + g.seconds, 0);
    const coverage = secs > 0 ? Math.max(0, Math.min(1, 1 - missingSecs / secs)) : 0;
    const straight = haversineM(a.centroid_lat, a.centroid_lon, b.centroid_lat, b.centroid_lon) / 1000;
    const straightSpeed = secs > 0 ? straight / (secs / 3600) : 0;
    const travel_mode: DetectedLeg["travel_mode"] =
      straightSpeed > FLIGHT_SPEED_KMH || (straight > 150 && straightSpeed > 200) ? "flight" : secs > 0 ? "ground" : "unknown";
    let conf = 0.9 * coverage;
    if (a.departure_uncertainty_seconds || b.arrival_uncertainty_seconds) conf -= 0.2;
    legs.push({
      seq: legs.length + 1, from_seq: a.seq, to_seq: b.seq,
      started_at: a.departure_at, ended_at: b.arrival_at, actual_seconds: secs,
      observed_distance_km: Number((dist / 1000).toFixed(3)), straight_line_km: Number(straight.toFixed(3)),
      travel_mode, missing_intervals: missing, coverage_ratio: Number(coverage.toFixed(3)),
      confidence: Math.max(0.05, Math.min(0.95, Number(conf.toFixed(2)))),
    });
  }
  return legs;
}

/** Delay is only meaningful against a comparable baseline. Current traffic is never treated as historical. */
export function computeDelay(actualSeconds: number, expectedSeconds: number | null, basis: string, mode: string): number | null {
  if (expectedSeconds === null || mode !== "ground") return null;
  if (basis !== "historical_traffic" && basis !== "static_route") return null;
  return actualSeconds - expectedSeconds;
}

// ---- Time display -------------------------------------------------------
export const DEFAULT_TZ = "Africa/Johannesburg";

function offsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(date);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** ISO 8601 in the given zone with explicit offset, e.g. 2026-10-24T19:06:00+02:00. */
export function toZonedIso(iso: string | null, timeZone = DEFAULT_TZ): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  const off = offsetMinutes(d, timeZone);
  const local = new Date(Math.floor(d.getTime() / 1000) * 1000 + off * 60000);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0"), mm = String(abs % 60).padStart(2, "0");
  return `${local.toISOString().slice(0, 19)}${sign}${hh}:${mm}`;
}

/** Short human label, e.g. "24 Oct 19:06". */
export function formatLocalShort(iso: string | null, timeZone = DEFAULT_TZ): string {
  const z = toZonedIso(iso, timeZone);
  if (!z) return "unknown";
  const [date, time] = z.split("T");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [, m, d] = date.split("-");
  return `${Number(d)} ${months[Number(m) - 1]} ${time.slice(0, 5)}`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "unknown";
  const s = Math.abs(Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return `${seconds < 0 ? "-" : ""}${h ? `${h}h ` : ""}${m}m`;
}
