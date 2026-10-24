import { useMemo } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { LocationPoint, TripStop } from "@/services/locationService";
import { classifyQuality, routeSegments, formatDuration } from "../../../supabase/functions/_shared/location-detect";

function token(name: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `hsl(${v})` : undefined;
}

export default function TripMap({ points, stops }: { points: LocationPoint[]; stops: TripStop[] }) {
  const { segments, bounds } = useMemo(() => {
    const reliable = classifyQuality(points).filter((p) => p.quality_status === "accepted");
    const segs = routeSegments(reliable);
    const all = reliable.map((p) => [p.latitude, p.longitude] as [number, number]);
    return { segments: segs, bounds: all.length ? all : null };
  }, [points]);

  if (!bounds) {
    return <div className="flex h-72 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">No GPS recorded</div>;
  }
  const primary = token("--primary");
  const muted = token("--muted-foreground");
  const accent = token("--accent") ?? primary;

  return (
    <div className="space-y-2">
      <div className="h-[420px] overflow-hidden rounded-md border">
        <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {segments.map((seg, i) => (
            <Polyline key={`s${i}`} positions={seg.map((p) => [p.latitude, p.longitude] as [number, number])} pathOptions={{ color: primary, weight: 4 }} />
          ))}
          {segments.slice(1).map((seg, i) => {
            const prev = segments[i][segments[i].length - 1];
            return (
              <Polyline key={`g${i}`} positions={[[prev.latitude, prev.longitude], [seg[0].latitude, seg[0].longitude]]}
                pathOptions={{ color: muted, weight: 2, dashArray: "6 8" }}>
                <Tooltip>Missing GPS — route unknown</Tooltip>
              </Polyline>
            );
          })}
          {stops.map((s) => (
            <CircleMarker key={s.id} center={[s.centroid_lat, s.centroid_lon]} radius={10} pathOptions={{ color: accent, fillOpacity: 0.85 }}>
              <Tooltip permanent direction="top">{s.seq}</Tooltip>
              <Tooltip>
                {s.label_override ?? s.place_name ?? "Unknown place"} · {s.dwell_seconds === null ? "dwell unknown" : formatDuration(s.dwell_seconds)}
                {s.mean_accuracy_m !== null ? ` · ±${s.mean_accuracy_m} m` : ""}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground">Solid = observed route. Dashed = no GPS (not a road). Numbered circles = stops. Fixes worse than ±100 m are left out.</p>
    </div>
  );
}
