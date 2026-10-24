// Recomputes stops + legs for one trip from its stored points. Incremental in
// the sense that it re-runs whenever new or late points land; manual
// label_override values survive by matching old stops to new ones.
// Callers pass a service-role client and must have verified user ownership.
import {
  classifyQuality, computeDelay, detectLegs, detectStops, DETECTION_VERSION, haversineM,
} from "./location-detect.ts";

const MAX_POINTS = 20000;
const MAX_GEOCODES = 5;
const MAX_ROUTES = 10;

async function reverseGeocode(lat: number, lon: number): Promise<{ name: string; id: string } | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lon}`,
      { headers: { "User-Agent": "VantoOS-TripLogger/1.0 (vantoos.com)" }, signal: AbortSignal.timeout(6000) },
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.display_name) return null;
    return { name: String(j.name || j.display_name).slice(0, 200), id: `${j.osm_type ?? ""}/${j.osm_id ?? ""}` };
  } catch { return null; }
}

export async function tomtomStatic(key: string | null, a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  // Optional, traffic-free drive-time ESTIMATE, never historical traffic.
  // The stored static_route basis distinguishes this baseline from observed GPS.
  // No configured key means no external request and no expected time.
  if (!key?.trim()) return null;
  try {
    const url = `https://api.tomtom.com/routing/1/calculateRoute/${a.lat},${a.lon}:${b.lat},${b.lon}/json?traffic=false&travelMode=car&key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const s = (await r.json())?.routes?.[0]?.summary;
    if (!s) return null;
    const seconds = s.travelTimeInSeconds;
    const meters = s.lengthInMeters;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0 ||
        typeof meters !== "number" || !Number.isFinite(meters) || meters < 0) return null;
    return { seconds, km: meters / 1000 };
  } catch { return null; }
}

export async function processTrip(admin: any, userId: string, tripId: string): Promise<{ ok: boolean; stops: number; legs: number; points: number; error?: string }> {
  const { data: run } = await admin.from("location_processing_runs")
    .insert({ user_id: userId, trip_id: tripId, algorithm_version: DETECTION_VERSION }).select("id").single();
  const finish = async (status: string, point_count: number, error_summary: string | null = null) => {
    if (run?.id) await admin.from("location_processing_runs")
      .update({ status, point_count, error_summary, finished_at: new Date().toISOString() }).eq("id", run.id);
  };
  try {
    const { data: pts, error } = await admin.from("trip_location_points")
      .select("id, recorded_at, latitude, longitude, accuracy_m, speed_kmh, quality_status")
      .eq("user_id", userId).eq("trip_id", tripId).order("recorded_at").limit(MAX_POINTS);
    if (error) throw new Error(error.message);
    const points = pts ?? [];

    // Persist quality flags where they changed.
    const classified = classifyQuality(points);
    const byStatus: Record<string, string[]> = {};
    for (const p of classified) {
      const orig = points.find((o: any) => o.id === p.id);
      if (orig && orig.quality_status !== p.quality_status) (byStatus[p.quality_status] ??= []).push(p.id!);
    }
    for (const [status, ids] of Object.entries(byStatus)) {
      for (let i = 0; i < ids.length; i += 500)
        await admin.from("trip_location_points").update({ quality_status: status }).in("id", ids.slice(i, i + 500));
    }

    const { stops, reliable, gaps } = detectStops(points);
    const legs = detectLegs(stops, reliable, gaps);

    const { data: oldStops } = await admin.from("trip_stops")
      .select("id, arrival_at, departure_at, centroid_lat, centroid_lon, label_override, place_name, place_provider, place_provider_id")
      .eq("user_id", userId).eq("trip_id", tripId);

    const matchOld = (s: typeof stops[number]) => (oldStops ?? []).find((o: any) => {
      const near = haversineM(o.centroid_lat, o.centroid_lon, s.centroid_lat, s.centroid_lon) <= 150;
      const oEnd = o.departure_at ? Date.parse(o.departure_at) : Infinity;
      const sEnd = s.departure_at ? Date.parse(s.departure_at) : Infinity;
      const overlap = Date.parse(o.arrival_at) <= sEnd && Date.parse(s.arrival_at) <= oEnd;
      return near && overlap;
    });

    let geocodes = 0;
    const rows = [];
    for (const s of stops) {
      const old: any = matchOld(s);
      let place = old?.place_name ? { name: old.place_name, provider: old.place_provider, id: old.place_provider_id } : null;
      if (!place && geocodes < MAX_GEOCODES) {
        if (geocodes > 0) await new Promise((r) => setTimeout(r, 1100)); // Nominatim: max 1 req/s
        geocodes++;
        const g = await reverseGeocode(s.centroid_lat, s.centroid_lon);
        if (g) place = { name: g.name, provider: "nominatim", id: g.id };
      }
      rows.push({
        user_id: userId, trip_id: tripId, seq: s.seq,
        arrival_at: s.arrival_at, arrival_uncertainty_seconds: s.arrival_uncertainty_seconds,
        departure_at: s.departure_at, departure_uncertainty_seconds: s.departure_uncertainty_seconds,
        dwell_seconds: s.dwell_seconds, centroid_lat: s.centroid_lat, centroid_lon: s.centroid_lon,
        radius_m: s.radius_m, mean_accuracy_m: s.mean_accuracy_m, point_count: s.point_count,
        place_name: place?.name ?? null, place_provider: place?.provider ?? null, place_provider_id: place?.id ?? null,
        confidence: s.confidence, detection_version: DETECTION_VERSION,
        label_override: old?.label_override ?? null,
      });
    }

    // Replace derived rows (links to old stops cascade; their labels are carried above).
    await admin.from("trip_legs").delete().eq("user_id", userId).eq("trip_id", tripId);
    // Keep expense links: remap them to the matching new stop after insert.
    const { data: links } = await admin.from("trip_expense_stop_links")
      .select("trip_expense_id, trip_stop_id").eq("user_id", userId);
    await admin.from("trip_stops").delete().eq("user_id", userId).eq("trip_id", tripId);
    const { data: inserted, error: insErr } = rows.length
      ? await admin.from("trip_stops").insert(rows).select("id, seq, centroid_lat, centroid_lon")
      : { data: [], error: null };
    if (insErr) throw new Error(insErr.message);
    const idBySeq = new Map<number, string>((inserted ?? []).map((r: any) => [r.seq, r.id]));

    const relinks = [];
    for (const l of links ?? []) {
      const old: any = (oldStops ?? []).find((o: any) => o.id === l.trip_stop_id);
      if (!old) continue;
      const nu: any = (inserted ?? []).find((n: any) => haversineM(n.centroid_lat, n.centroid_lon, old.centroid_lat, old.centroid_lon) <= 150);
      if (nu) relinks.push({ trip_expense_id: l.trip_expense_id, trip_stop_id: nu.id, user_id: userId });
    }
    if (relinks.length) await admin.from("trip_expense_stop_links").upsert(relinks, { ignoreDuplicates: true });

    const key = (globalThis as any).Deno?.env.get("TOMTOM_API_KEY") ?? null;
    let routed = 0;
    const legRows = [];
    for (const l of legs) {
      const a = stops[l.from_seq - 1], b = stops[l.to_seq - 1];
      let expected: { seconds: number; km: number } | null = null;
      let basis = "none";
      let reqAt: string | null = null;
      if (key && l.travel_mode === "ground" && routed < MAX_ROUTES) {
        routed++;
        reqAt = new Date().toISOString();
        expected = await tomtomStatic(key, { lat: a.centroid_lat, lon: a.centroid_lon }, { lat: b.centroid_lat, lon: b.centroid_lon });
        if (expected) basis = "static_route";
      }
      legRows.push({
        user_id: userId, trip_id: tripId, seq: l.seq,
        from_stop_id: idBySeq.get(l.from_seq) ?? null, to_stop_id: idBySeq.get(l.to_seq) ?? null,
        started_at: l.started_at, ended_at: l.ended_at, actual_seconds: l.actual_seconds,
        observed_distance_km: l.observed_distance_km, travel_mode: l.travel_mode,
        missing_intervals: l.missing_intervals,
        expected_seconds: expected ? Math.round(expected.seconds) : null,
        expected_distance_km: expected ? Number(expected.km.toFixed(3)) : null,
        delay_seconds: computeDelay(l.actual_seconds, expected ? Math.round(expected.seconds) : null, basis, l.travel_mode),
        routing_provider: expected ? "tomtom" : null, routing_requested_at: reqAt,
        comparison_basis: basis, coverage_ratio: l.coverage_ratio, confidence: l.confidence,
        detection_version: DETECTION_VERSION,
      });
    }
    if (legRows.length) {
      const { error: legErr } = await admin.from("trip_legs").insert(legRows);
      if (legErr) throw new Error(legErr.message);
    }
    await finish("ok", points.length);
    return { ok: true, stops: rows.length, legs: legRows.length, points: points.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finish("error", 0, msg.slice(0, 500));
    return { ok: false, stops: 0, legs: 0, points: 0, error: msg };
  }
}
