import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export interface LocationDevice {
  id: string; display_name: string; source: string; enabled: boolean;
  last_seen_at: string | null; created_at: string; revoked_at: string | null;
}
export interface TrackingSession {
  id: string; trip_id: string; device_id: string; status: "active" | "paused" | "ended";
  actual_started_at: string; actual_ended_at: string | null;
}
export interface LocationPoint {
  id: string; recorded_at: string; latitude: number; longitude: number;
  accuracy_m: number | null; speed_kmh: number | null; quality_status: string;
}
export interface TripStop {
  id: string; seq: number; arrival_at: string; arrival_uncertainty_seconds: number;
  departure_at: string | null; departure_uncertainty_seconds: number; dwell_seconds: number | null;
  centroid_lat: number; centroid_lon: number; radius_m: number | null; mean_accuracy_m: number | null;
  point_count: number; place_name: string | null; label_override: string | null; confidence: number;
}
export interface TripLeg {
  id: string; seq: number; from_stop_id: string | null; to_stop_id: string | null;
  started_at: string | null; ended_at: string | null; actual_seconds: number | null;
  observed_distance_km: number | null; travel_mode: string; coverage_ratio: number | null;
  expected_seconds: number | null; delay_seconds: number | null; comparison_basis: string;
  confidence: number; missing_intervals: { from: string; to: string; seconds: number }[];
}

export const INGEST_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/location-ingest`;

async function uid() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return "vtl_" + btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const must = (r: { data: any; error: any }): any => { if (r.error) throw r.error; return r.data; };

export const locationService = {
  async devices(): Promise<LocationDevice[]> {
    return must(await db.from("location_devices").select("id, display_name, source, enabled, last_seen_at, created_at, revoked_at").order("created_at")) ?? [];
  },
  /** Token is returned once and only its hash is stored. */
  async registerDevice(display_name: string): Promise<{ device: LocationDevice; token: string }> {
    const user_id = await uid();
    const token = newToken();
    const token_hash = await sha256Hex(token);
    const device = must(await db.from("location_devices").insert({ user_id, display_name, source: "owntracks", token_hash })
      .select("id, display_name, source, enabled, last_seen_at, created_at, revoked_at").single());
    return { device, token };
  },
  async setDeviceEnabled(id: string, enabled: boolean) { must(await db.from("location_devices").update({ enabled }).eq("id", id)); },
  async revokeDevice(id: string) { must(await db.from("location_devices").update({ enabled: false, revoked_at: new Date().toISOString() }).eq("id", id)); },

  async sessions(tripId: string): Promise<TrackingSession[]> {
    return must(await db.from("trip_tracking_sessions").select("*").eq("trip_id", tripId).order("actual_started_at")) ?? [];
  },
  async startSession(trip_id: string, device_id: string) {
    const user_id = await uid();
    must(await db.from("trip_tracking_sessions").insert({ user_id, trip_id, device_id, status: "active" }));
  },
  async setSessionStatus(id: string, status: TrackingSession["status"]) {
    const patch: any = { status, updated_at: new Date().toISOString() };
    if (status === "ended") patch.actual_ended_at = new Date().toISOString();
    must(await db.from("trip_tracking_sessions").update(patch).eq("id", id));
  },

  async points(tripId: string): Promise<LocationPoint[]> {
    return must(await db.from("trip_location_points").select("id, recorded_at, latitude, longitude, accuracy_m, speed_kmh, quality_status")
      .eq("trip_id", tripId).order("recorded_at").limit(20000)) ?? [];
  },
  async unassignedCount(fromIso: string, toIso: string): Promise<number> {
    const r = await db.from("trip_location_points").select("id", { count: "exact", head: true })
      .is("trip_id", null).gte("recorded_at", fromIso).lt("recorded_at", toIso);
    if (r.error) throw r.error;
    return r.count ?? 0;
  },
  async assignUnassigned(tripId: string, fromIso: string, toIso: string) {
    must(await db.from("trip_location_points").update({ trip_id: tripId })
      .is("trip_id", null).gte("recorded_at", fromIso).lt("recorded_at", toIso));
    await this.reprocess(tripId);
  },
  async stops(tripId: string): Promise<TripStop[]> {
    return must(await db.from("trip_stops").select("*").eq("trip_id", tripId).order("seq")) ?? [];
  },
  async legs(tripId: string): Promise<TripLeg[]> {
    return must(await db.from("trip_legs").select("*").eq("trip_id", tripId).order("seq")) ?? [];
  },
  async setStopLabel(id: string, label: string) {
    must(await db.from("trip_stops").update({ label_override: label.trim() || null, updated_at: new Date().toISOString() }).eq("id", id));
  },
  async reprocess(tripId: string) {
    const { data, error } = await supabase.functions.invoke("location-process", { body: { trip_id: tripId } });
    if (error) throw error;
    return data;
  },
  async deleteTripData(tripId: string) {
    must(await db.from("trip_legs").delete().eq("trip_id", tripId));
    must(await db.from("trip_stops").delete().eq("trip_id", tripId));
    must(await db.from("trip_location_points").delete().eq("trip_id", tripId));
  },
};
