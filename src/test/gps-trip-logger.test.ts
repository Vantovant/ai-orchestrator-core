import { describe, it, expect, vi, afterEach } from "vitest";
import { tomtomStatic } from "../../supabase/functions/_shared/location-process";
import {
  parsePayload, detectStops, detectLegs, toZonedIso, formatLocalShort, routeSegments, classifyQuality,
  computeDelay, fingerprintInput, MAX_BATCH,
} from "../../supabase/functions/_shared/location-detect";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const T0 = Date.parse("2026-10-24T08:00:00Z");
const at = (min: number) => new Date(T0 + min * 60000).toISOString();
// ~111 m per 0.001 deg latitude
const pt = (min: number, lat: number, lon = 28.0, acc = 10) => ({ recorded_at: at(min), latitude: lat, longitude: lon, accuracy_m: acc });

describe("optional TomTom drive-time estimates", () => {
  afterEach(() => vi.unstubAllGlobals());
  const a = { lat: -26, lon: 28 }, b = { lat: -26.1, lon: 28.1 };

  it("does not request an estimate without a configured key", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect(await tomtomStatic(null, a, b)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it("requests a traffic-free car estimate, not historical traffic", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ summary: { travelTimeInSeconds: 600, lengthInMeters: 5000 } }] })));
    vi.stubGlobal("fetch", request);
    expect(await tomtomStatic("test-only", a, b)).toEqual({ seconds: 600, km: 5 });
    const url = new URL(request.mock.calls[0][0]);
    expect(url.searchParams.get("traffic")).toBe("false");
    expect(url.searchParams.get("travelMode")).toBe("car");
    expect(url.searchParams.has("departAt")).toBe(false);
  });

  it("leaves expected time unknown on invalid or failed routing responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ routes: [{ summary: { travelTimeInSeconds: null, lengthInMeters: 5000 } }] }))));
    expect(await tomtomStatic("test-only", a, b)).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    expect(await tomtomStatic("test-only", a, b)).toBeNull();
  });
});

describe("ingest parsing", () => {
  it("accepts a valid OwnTracks location and converts tst to UTC", () => {
    const r = parsePayload({ _type: "location", lat: -26.1, lon: 28.05, tst: 1792843200, acc: 8, vel: 40, tid: "va" }, Date.parse("2026-10-24T12:10:00Z"));
    expect(r.format).toBe("owntracks");
    expect(r.events).toHaveLength(1);
    expect(r.events[0].recorded_at).toBe(new Date(1792843200 * 1000).toISOString());
    expect(r.events[0].source_event_id).toBe("va:1792843200");
  });

  it("rejects an invalid latitude", () => {
    const r = parsePayload({ schema_version: 1, events: [{ source_event_id: "x", recorded_at: at(0), latitude: 91, longitude: 28 }] }, NOW);
    expect(r.events).toHaveLength(0);
    expect(r.rejected[0].reason).toBe("invalid_latitude");
  });

  it("rejects implausible timestamps and oversized batches", () => {
    const future = parsePayload({ events: [{ recorded_at: "2026-10-24T13:00:00Z", latitude: -26, longitude: 28 }] }, NOW);
    expect(future.rejected[0].reason).toBe("timestamp_in_future");
    const big = parsePayload({ events: Array.from({ length: MAX_BATCH + 1 }, () => ({})) }, NOW);
    expect(big.rejected[0].reason).toBe("batch_too_large");
  });

  it("duplicate replay yields identical dedupe keys (idempotent with the unique index)", () => {
    const body = [{ _type: "location", lat: -26.1, lon: 28.05, tst: 1792843200, tid: "va" }];
    const a = parsePayload(body, NOW + 3600e3).events[0], b = parsePayload(body, NOW + 3600e3).events[0];
    expect(a.source_event_id).toBe(b.source_event_id);
    expect(fingerprintInput(a)).toBe(fingerprintInput(b));
  });
});

describe("stop detection", () => {
  it("detects a 5-minute stop with confidence", () => {
    const pts = [
      ...[0, 1, 2, 3, 4, 5, 6].map((m) => pt(m, -26.1 + (m % 2) * 0.0001)),
      ...[7, 8, 9, 10].map((m, i) => pt(m, -26.1 + (i + 1) * 0.01)),
    ];
    const { stops } = detectStops(pts);
    expect(stops).toHaveLength(1);
    expect(stops[0].dwell_seconds).toBe(360);
    expect(stops[0].confidence).toBeGreaterThanOrEqual(0.7);
    expect(stops[0].departure_at).toBe(at(6));
  });

  it("stationary GPS drift (incl. one spike) does not create a drive", () => {
    const pts = Array.from({ length: 60 }, (_, m) => pt(m, -26.1 + ((m * 7) % 5) * 0.0001, 28 + ((m * 3) % 4) * 0.0001, 20));
    pts[30] = pt(30, -26.1 + 0.003); // single ~330 m spike
    const { stops } = detectStops(pts);
    const legs = detectLegs(stops, detectStops(pts).reliable, detectStops(pts).gaps);
    expect(stops).toHaveLength(1);
    expect(legs).toHaveLength(0);
  });

  it("unknown departure stays unknown", () => {
    const { stops } = detectStops([0, 2, 4, 6, 8].map((m) => pt(m, -26.1)));
    expect(stops[0].departure_at).toBeNull();
    expect(stops[0].dwell_seconds).toBeNull();
  });

  it("15-minute offline gap at departure becomes an interval, not an invented time", () => {
    const pts = [...[0, 2, 4, 6].map((m) => pt(m, -26.1)), ...[21, 22, 23].map((m, i) => pt(m, -26.05 - i * 0.01))];
    const { stops, gaps } = detectStops(pts);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].seconds).toBe(900);
    expect(stops[0].departure_at).toBe(at(6));
    expect(stops[0].departure_uncertainty_seconds).toBe(900);
    expect(stops[0].confidence).toBeLessThan(0.7);
    expect(routeSegments(detectStops(pts).reliable)).toHaveLength(2); // gap not drawn
  });

  it("a flight-speed leg is never classified as a car leg", () => {
    const pts = [...[0, 2, 4, 6].map((m) => pt(m, -26.1)), ...[66, 68, 70, 72].map((m) => pt(m, -33.9, 18.6))];
    const d = detectStops(pts);
    const legs = detectLegs(d.stops, d.reliable, d.gaps);
    expect(legs[0].travel_mode).toBe("flight");
    expect(computeDelay(legs[0].actual_seconds, 3600, "static_route", legs[0].travel_mode)).toBeNull();
  });

  it("current traffic is never used as a delay basis", () => {
    expect(computeDelay(4000, 3600, "current_traffic", "ground")).toBeNull();
    expect(computeDelay(4000, 3600, "static_route", "ground")).toBe(400);
  });

  it("low-accuracy fixes are excluded", () => {
    const q = classifyQuality([pt(0, -26.1, 28, 150), pt(1, -26.1)]);
    expect(q[0].quality_status).toBe("low_accuracy");
  });

  it("no GPS shows no route", () => {
    expect(routeSegments([])).toHaveLength(0);
    expect(detectStops([]).stops).toHaveLength(0);
  });
});

describe("time display", () => {
  it("shows SAST with +02:00", () => {
    expect(toZonedIso("2026-10-24T17:06:00Z")).toBe("2026-10-24T19:06:00+02:00");
    expect(formatLocalShort("2026-10-24T17:06:00Z")).toBe("24 Oct 19:06");
  });
});
