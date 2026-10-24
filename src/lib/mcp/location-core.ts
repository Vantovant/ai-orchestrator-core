// GPS Trip Logger MCP logic. Runs with the caller's token under RLS (never the
// service role). Every query also filters user_id explicitly.
// Device registration / tokens are deliberately NOT available here.
import {
  routeSegments, classifyQuality, findGaps, toZonedIso, formatDuration, DEFAULT_TZ, haversineM,
} from "../../../supabase/functions/_shared/location-detect";

type Res = Record<string, unknown> & { ok: boolean };
const NO_GPS = "No GPS recorded";

async function ownTrip(sb: any, userId: string, tripId: string) {
  const { data } = await sb.from("trips").select("id, destination, start_date, end_date, status")
    .eq("id", tripId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  return data;
}

function stopView(s: any, tz: string) {
  return {
    id: s.id, seq: s.seq,
    label: s.label_override ?? s.place_name ?? null,
    label_source: s.label_override ? "user" : s.place_name ? "inferred_reverse_geocode_candidate" : "unknown",
    arrival_at: s.arrival_at, arrival_local: toZonedIso(s.arrival_at, tz),
    arrival_marker: s.arrival_uncertainty_seconds ? "inferred_interval" : "observed",
    arrival_window_seconds: s.arrival_uncertainty_seconds,
    departure_at: s.departure_at, departure_local: toZonedIso(s.departure_at, tz),
    departure_marker: !s.departure_at ? "unknown" : s.departure_uncertainty_seconds ? "inferred_interval" : "observed",
    departure_window_seconds: s.departure_uncertainty_seconds,
    dwell_seconds: s.dwell_seconds, dwell: s.dwell_seconds === null ? "unknown (departure not observed)" : formatDuration(s.dwell_seconds),
    centroid: { lat: s.centroid_lat, lon: s.centroid_lon }, radius_m: s.radius_m,
    mean_accuracy_m: s.mean_accuracy_m, point_count: s.point_count, confidence: s.confidence,
  };
}

function legView(l: any, tz: string) {
  return {
    id: l.id, seq: l.seq, from_stop_id: l.from_stop_id, to_stop_id: l.to_stop_id,
    started_at: l.started_at, started_local: toZonedIso(l.started_at, tz),
    ended_at: l.ended_at, ended_local: toZonedIso(l.ended_at, tz),
    actual_seconds: l.actual_seconds, actual: formatDuration(l.actual_seconds), actual_marker: "observed",
    observed_distance_km: l.observed_distance_km, travel_mode: l.travel_mode,
    missing_intervals: l.missing_intervals, coverage_ratio: l.coverage_ratio,
    expected_seconds: l.expected_seconds, expected_distance_km: l.expected_distance_km,
    comparison_basis: l.comparison_basis, routing_provider: l.routing_provider,
    delay_seconds: l.delay_seconds,
    delay_marker: l.delay_seconds === null ? "unknown" : "inferred",
    confidence: l.confidence,
  };
}

export async function runLocationAction(sb: any, userId: string, action: string, a: any): Promise<Res> {
  const tz = typeof a?.timezone === "string" && a.timezone ? a.timezone : DEFAULT_TZ;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return { ok: false, error: "invalid_timezone" }; }

  switch (action) {
    case "list_location_devices": {
      const { data, error } = await sb.from("location_devices")
        .select("id, display_name, source, enabled, last_seen_at, created_at, revoked_at")
        .eq("user_id", userId).order("created_at");
      if (error) return { ok: false, error: error.message };
      return { ok: true, devices: data ?? [], note: "Register devices in the VantoOS app (Travel → trip → Tracking). Tokens are never shown here." };
    }

    case "get_location_capture_status": {
      const [{ data: devices }, { data: sessions }, { count: unassigned }, { data: lastPt }] = await Promise.all([
        sb.from("location_devices").select("id, display_name, enabled, last_seen_at, revoked_at").eq("user_id", userId),
        sb.from("trip_tracking_sessions").select("id, trip_id, device_id, status, actual_started_at, actual_ended_at").eq("user_id", userId).neq("status", "ended"),
        sb.from("trip_location_points").select("id", { count: "exact", head: true }).eq("user_id", userId).is("trip_id", null),
        sb.from("trip_location_points").select("recorded_at, received_at, accuracy_m, trip_id").eq("user_id", userId).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        ok: true, now: new Date().toISOString(), timezone: tz,
        devices: devices ?? [], open_tracking_sessions: sessions ?? [],
        unassigned_point_count: unassigned ?? 0,
        last_fix: lastPt ? { ...lastPt, recorded_local: toZonedIso(lastPt.recorded_at, tz) } : null,
        message: lastPt ? undefined : NO_GPS,
      };
    }

    case "get_trip_timeline": {
      const trip = await ownTrip(sb, userId, String(a.trip_id ?? ""));
      if (!trip) return { ok: false, error: "not_found" };
      const [{ data: stops }, { data: legs }, { data: sessions }, { count }] = await Promise.all([
        sb.from("trip_stops").select("*").eq("user_id", userId).eq("trip_id", trip.id).order("seq"),
        sb.from("trip_legs").select("*").eq("user_id", userId).eq("trip_id", trip.id).order("seq"),
        sb.from("trip_tracking_sessions").select("status, actual_started_at, actual_ended_at").eq("user_id", userId).eq("trip_id", trip.id),
        sb.from("trip_location_points").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("trip_id", trip.id),
      ]);
      const base = {
        trip: { ...trip, end_date_marker: "planned (provisional — not a confirmed end time)" },
        tracking_sessions: sessions ?? [], timezone: tz, point_count: count ?? 0,
      };
      if (!count) return { ok: true, ...base, message: NO_GPS, stops: [], legs: [] };
      return { ok: true, ...base, stops: (stops ?? []).map((s: any) => stopView(s, tz)), legs: (legs ?? []).map((l: any) => legView(l, tz)) };
    }

    case "list_trip_stops": {
      const trip = await ownTrip(sb, userId, String(a.trip_id ?? ""));
      if (!trip) return { ok: false, error: "not_found" };
      const limit = Math.min(Math.max(Number(a.limit ?? 25), 1), 100);
      const after = Number(a.cursor ?? 0) || 0;
      const { data, error } = await sb.from("trip_stops").select("*").eq("user_id", userId).eq("trip_id", trip.id)
        .gt("seq", after).order("seq").limit(limit + 1);
      if (error) return { ok: false, error: error.message };
      const rows = data ?? [];
      const page = rows.slice(0, limit);
      return {
        ok: true, timezone: tz, stops: page.map((s: any) => stopView(s, tz)),
        next_cursor: rows.length > limit ? String(page[page.length - 1].seq) : null,
        message: page.length || after ? undefined : "No stops detected (or No GPS recorded).",
      };
    }

    case "get_trip_route": {
      const trip = await ownTrip(sb, userId, String(a.trip_id ?? ""));
      if (!trip) return { ok: false, error: "not_found" };
      const { data: pts } = await sb.from("trip_location_points")
        .select("id, recorded_at, latitude, longitude, accuracy_m, quality_status")
        .eq("user_id", userId).eq("trip_id", trip.id).order("recorded_at").limit(20000);
      if (!pts?.length) return { ok: true, message: NO_GPS, segments: [], missing_intervals: [] };
      const reliable = classifyQuality(pts).filter((p) => p.quality_status === "accepted");
      const simplifyM = a.simplify === false ? 0 : 25;
      const segments = routeSegments(reliable).map((seg) => {
        const out = [seg[0]];
        for (const p of seg.slice(1)) {
          const l = out[out.length - 1];
          if (haversineM(l.latitude, l.longitude, p.latitude, p.longitude) >= simplifyM) out.push(p);
        }
        if (out[out.length - 1] !== seg[seg.length - 1]) out.push(seg[seg.length - 1]);
        return {
          from: seg[0].recorded_at, to: seg[seg.length - 1].recorded_at, marker: "observed",
          points: out.map((p) => [Number(p.latitude.toFixed(6)), Number(p.longitude.toFixed(6)), p.recorded_at, p.accuracy_m]),
        };
      });
      return {
        ok: true, point_format: "[lat, lon, recorded_at, accuracy_m]",
        total_points: pts.length, excluded_low_quality: pts.length - reliable.length,
        segments, missing_intervals: findGaps(reliable).map((g) => ({ ...g, marker: "unknown — no GPS, not drawn" })),
      };
    }

    case "compare_leg_to_expected": {
      const trip = await ownTrip(sb, userId, String(a.trip_id ?? ""));
      if (!trip) return { ok: false, error: "not_found" };
      const { data: leg } = await sb.from("trip_legs").select("*").eq("user_id", userId).eq("trip_id", trip.id).eq("id", String(a.leg_id ?? "")).maybeSingle();
      if (!leg) return { ok: false, error: "leg_not_found" };
      const v = legView(leg, tz);
      let verdict: string;
      if (leg.travel_mode === "flight") verdict = "Flight leg — not compared with a car route.";
      else if (leg.delay_seconds === null) verdict = `No comparable expected time (basis: ${leg.comparison_basis}).`;
      else verdict = leg.delay_seconds > 300 ? `Ran about ${formatDuration(leg.delay_seconds)} longer than the ${leg.comparison_basis.replace("_", " ")} estimate.` : "Within 5 minutes of the estimate.";
      if (leg.coverage_ratio !== null && leg.coverage_ratio < 0.7) verdict += " Low GPS coverage on this leg — treat as indicative.";
      return { ok: true, leg: v, verdict };
    }

    case "link_trip_expense_to_stop": {
      const { error } = await sb.from("trip_expense_stop_links").insert({
        trip_expense_id: String(a.trip_expense_id ?? ""), trip_stop_id: String(a.trip_stop_id ?? ""), user_id: userId,
      });
      if (error && error.code !== "23505") return { ok: false, error: error.message };
      return { ok: true, linked: true, note: "Reference only — no finance entry was created or changed." };
    }

    case "set_trip_stop_label": {
      const label = String(a.label ?? "").trim().slice(0, 200);
      const { data, error } = await sb.from("trip_stops").update({ label_override: label || null, updated_at: new Date().toISOString() })
        .eq("user_id", userId).eq("id", String(a.stop_id ?? "")).select("id, label_override").maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "stop_not_found" };
      return { ok: true, stop: data, note: "Your label survives recomputation." };
    }

    case "export_trip_location_data": {
      const trip = await ownTrip(sb, userId, String(a.trip_id ?? ""));
      if (!trip) return { ok: false, error: "not_found" };
      const [{ data: points }, { data: stops }, { data: legs }] = await Promise.all([
        sb.from("trip_location_points").select("recorded_at, latitude, longitude, accuracy_m, speed_kmh, heading_deg, altitude_m, source, quality_status").eq("user_id", userId).eq("trip_id", trip.id).order("recorded_at").limit(5000),
        sb.from("trip_stops").select("*").eq("user_id", userId).eq("trip_id", trip.id).order("seq"),
        sb.from("trip_legs").select("*").eq("user_id", userId).eq("trip_id", trip.id).order("seq"),
      ]);
      return { ok: true, exported_at: new Date().toISOString(), trip, points: points ?? [], points_capped_at: 5000, stops: stops ?? [], legs: legs ?? [], message: points?.length ? undefined : NO_GPS };
    }

    case "delete_trip_location_data": {
      if (a.confirm !== true) return { ok: false, error: "confirm_required: pass confirm=true after the user explicitly agrees" };
      const trip = await ownTrip(sb, userId, String(a.trip_id ?? ""));
      if (!trip) return { ok: false, error: "not_found" };
      const scope = a.scope === "points" || a.scope === "derived" ? a.scope : "all";
      const deleted: Record<string, number> = {};
      if (scope !== "points") {
        const l = await sb.from("trip_legs").delete({ count: "exact" }).eq("user_id", userId).eq("trip_id", trip.id);
        const s = await sb.from("trip_stops").delete({ count: "exact" }).eq("user_id", userId).eq("trip_id", trip.id);
        deleted.legs = l.count ?? 0; deleted.stops = s.count ?? 0;
      }
      if (scope !== "derived") {
        const p = await sb.from("trip_location_points").delete({ count: "exact" }).eq("user_id", userId).eq("trip_id", trip.id);
        if (p.error) return { ok: false, error: p.error.message };
        deleted.points = p.count ?? 0;
      }
      return { ok: true, scope, deleted, note: "Trip, expenses and finance entries were not touched." };
    }
  }
  return { ok: false, error: `unknown_action: ${action}` };
}
