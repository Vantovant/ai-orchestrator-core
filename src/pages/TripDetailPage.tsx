import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Download, Loader2, MapPin, Pause, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { tripService, type Trip } from "@/services/travelService";
import {
  INGEST_URL, locationService, type LocationDevice, type LocationPoint, type TrackingSession, type TripLeg, type TripStop,
} from "@/services/locationService";
import TripMap from "@/components/travel/TripMap";
import { formatDuration, formatLocalShort, toZonedIso } from "../../supabase/functions/_shared/location-detect";

const err = (e: any) => e?.message ?? String(e);

export default function TripDetailPage() {
  const { tripId = "" } = useParams();
  const { toast } = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<LocationPoint[]>([]);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [legs, setLegs] = useState<TripLeg[]>([]);
  const [devices, setDevices] = useState<LocationDevice[]>([]);
  const [sessions, setSessions] = useState<TrackingSession[]>([]);
  const [unassigned, setUnassigned] = useState(0);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [shownToken, setShownToken] = useState<{ name: string; token: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Trip dates are provisional plans; assignment window is start 00:00 to end+1 day 00:00 SAST.
  const window = useMemo(() => {
    if (!trip) return null;
    const from = new Date(`${trip.start_date}T00:00:00+02:00`).toISOString();
    const to = new Date(new Date(`${trip.end_date}T00:00:00+02:00`).getTime() + 86400000).toISOString();
    return { from, to };
  }, [trip]);

  const load = useCallback(async () => {
    try {
      const trips = await tripService.list();
      const t = trips.find((x) => x.id === tripId) ?? null;
      setTrip(t);
      if (!t) return;
      const [p, s, l, d, ss] = await Promise.all([
        locationService.points(t.id), locationService.stops(t.id), locationService.legs(t.id),
        locationService.devices(), locationService.sessions(t.id),
      ]);
      setPoints(p); setStops(s); setLegs(l); setDevices(d); setSessions(ss);
      const from = new Date(`${t.start_date}T00:00:00+02:00`).toISOString();
      const to = new Date(new Date(`${t.end_date}T00:00:00+02:00`).getTime() + 86400000).toISOString();
      setUnassigned(await locationService.unassignedCount(from, to));
    } catch (e) {
      toast({ title: "Couldn't load trip", description: err(e), variant: "destructive" });
    } finally { setLoading(false); }
  }, [tripId, toast]);

  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) toast({ title: ok }); await load(); }
    catch (e) { toast({ title: "Something went wrong", description: err(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!trip) return <div className="space-y-3"><Link to="/travel" className="text-sm text-primary">← Back to Travel</Link><p>Trip not found.</p></div>;

  const stopName = (id: string | null) => {
    const s = stops.find((x) => x.id === id);
    return s ? `${s.seq}. ${s.label_override ?? s.place_name ?? "Unknown place"}` : "—";
  };
  const lastFix = points.length ? points[points.length - 1] : null;
  const activeDevices = devices.filter((d) => !d.revoked_at);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), trip, points, stops, legs }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trip-${trip.id}-location.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = (text: string) => { void navigator.clipboard.writeText(text); toast({ title: "Copied" }); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to="/travel" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Travel</Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><MapPin className="h-5 w-5 text-primary" />{trip.destination}</h1>
          <p className="text-sm text-muted-foreground">Planned {trip.start_date} → {trip.end_date} <span className="text-xs">(planned end date, not confirmed)</span></p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" disabled={busy || !points.length} onClick={() => act(() => locationService.reprocess(trip.id), "Timeline recalculated")}>
          <RefreshCw className="h-4 w-4" /> Recalculate
        </Button>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-3">
          {!points.length ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No GPS recorded for this trip.</CardContent></Card>
          ) : !stops.length ? (
            <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">{points.length} GPS fixes, no stops of 5+ minutes detected yet.</CardContent></Card>
          ) : (
            stops.map((s) => {
              const leg = legs.find((l) => l.from_stop_id === s.id);
              return (
                <div key={s.id} className="space-y-2">
                  <Card>
                    <CardContent className="space-y-1 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">{s.seq}. {s.label_override ?? s.place_name ?? "Unknown place"}
                          {!s.label_override && s.place_name && <span className="ml-1 text-xs text-muted-foreground">(suggested)</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline">confidence {Math.round(s.confidence * 100)}%</Badge>
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ id: s.id, label: s.label_override ?? s.place_name ?? "" })}>Rename</Button>
                        </div>
                      </div>
                      <div className="text-sm">
                        Arrived {formatLocalShort(s.arrival_at)}{s.arrival_uncertainty_seconds ? ` (somewhere in the ${formatDuration(s.arrival_uncertainty_seconds)} before — no GPS)` : ""}
                        {" · "}
                        {s.departure_at ? <>Left {formatLocalShort(s.departure_at)}{s.departure_uncertainty_seconds ? ` (or up to ${formatDuration(s.departure_uncertainty_seconds)} later — no GPS)` : ""}</> : "Departure unknown"}
                        {" · "}Stayed {s.dwell_seconds === null ? "unknown" : formatDuration(s.dwell_seconds)}
                      </div>
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">Details</summary>
                        <div>Arrival {toZonedIso(s.arrival_at)} · Departure {toZonedIso(s.departure_at) ?? "unknown"}</div>
                        <div>{s.point_count} fixes · radius {s.radius_m ?? "?"} m · accuracy ±{s.mean_accuracy_m ?? "?"} m</div>
                      </details>
                    </CardContent>
                  </Card>
                  {leg && (
                    <div className="ml-4 border-l-2 border-dashed pl-4 text-sm text-muted-foreground">
                      {leg.travel_mode === "flight" ? "Flight" : "Drive"} to {stopName(leg.to_stop_id)} · {formatDuration(leg.actual_seconds)} · {leg.observed_distance_km?.toFixed(1)} km observed
                      {leg.coverage_ratio !== null && leg.coverage_ratio < 1 ? ` · GPS coverage ${Math.round(leg.coverage_ratio * 100)}%` : ""}
                      {leg.delay_seconds !== null
                        ? ` · ${leg.delay_seconds > 0 ? `${formatDuration(leg.delay_seconds)} slower` : "on time"} vs ${leg.comparison_basis.replace("_", " ")}`
                        : " · no expected time to compare"}
                    </div>
                  )}
                </div>
              );
            })
          )}
          <p className="text-xs text-muted-foreground">Times shown in South African time (SAST, +02:00).</p>
        </TabsContent>

        <TabsContent value="map"><TripMap points={points} stops={stops} /></TabsContent>

        <TabsContent value="tracking" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">This trip</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>Last fix: {lastFix ? `${formatLocalShort(lastFix.recorded_at)} (±${lastFix.accuracy_m ?? "?"} m)` : "No GPS recorded"}</div>
              {sessions.filter((s) => s.status !== "ended").map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                  <span>{devices.find((d) => d.id === s.device_id)?.display_name ?? "device"} since {formatLocalShort(s.actual_started_at)}</span>
                  <div className="ml-auto flex gap-1">
                    {s.status === "active"
                      ? <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => act(() => locationService.setSessionStatus(s.id, "paused"))}><Pause className="h-3.5 w-3.5" />Pause</Button>
                      : <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => act(() => locationService.setSessionStatus(s.id, "active"))}><Play className="h-3.5 w-3.5" />Resume</Button>}
                    <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => act(() => locationService.setSessionStatus(s.id, "ended"))}><Square className="h-3.5 w-3.5" />End</Button>
                  </div>
                </div>
              ))}
              {activeDevices.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeDevices.filter((d) => !sessions.some((s) => s.device_id === d.id && s.status !== "ended")).map((d) => (
                    <Button key={d.id} size="sm" className="gap-1" disabled={busy} onClick={() => act(() => locationService.startSession(trip.id, d.id), "Tracking started")}>
                      <Play className="h-3.5 w-3.5" />Start tracking with {d.display_name}
                    </Button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">While paused, fixes are still received but not attached to this trip. If two trips track the same phone at once, fixes stay unassigned.</p>
              {unassigned > 0 && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => window && act(() => locationService.assignUnassigned(trip.id, window.from, window.to), "Fixes assigned")}>
                  Assign {unassigned} unassigned fixes from the trip dates
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Phones</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {devices.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <span className="font-medium">{d.display_name}</span>
                  {d.revoked_at ? <Badge variant="secondary">revoked</Badge> : d.enabled ? <Badge>on</Badge> : <Badge variant="secondary">off</Badge>}
                  <span className="text-xs text-muted-foreground">last seen {d.last_seen_at ? formatLocalShort(d.last_seen_at) : "never"}</span>
                  {!d.revoked_at && (
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => locationService.setDeviceEnabled(d.id, !d.enabled))}>{d.enabled ? "Turn off" : "Turn on"}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={busy} onClick={() => act(() => locationService.revokeDevice(d.id), "Phone revoked")}>Revoke</Button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Phone name, e.g. Vanto Android" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <Button disabled={busy || !newName.trim()} onClick={() => act(async () => {
                  const { token } = await locationService.registerDevice(newName.trim());
                  setShownToken({ name: newName.trim(), token }); setNewName("");
                })}>Add phone</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Your data</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1" onClick={exportJson}><Download className="h-4 w-4" />Export</Button>
              <Button size="sm" variant="outline" className="gap-1 text-destructive" disabled={!points.length && !stops.length} onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" />Delete GPS data</Button>
              <p className="w-full text-xs text-muted-foreground">Raw fixes are planned to be kept 90 days; nothing is deleted automatically yet. Trip, expenses and finance are never changed by GPS data.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!shownToken} onOpenChange={(o) => !o && setShownToken(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set up OwnTracks on {shownToken?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium text-destructive">This password is shown only once. Copy it now.</p>
            {[
              ["Mode", "HTTP"],
              ["URL (Host)", INGEST_URL],
              ["Authentication", "On"],
              ["Username", shownToken?.name ?? ""],
              ["Password", shownToken?.token ?? ""],
            ].map(([k, v]) => (
              <div key={k} className="space-y-1">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="flex gap-2"><Input readOnly value={v} className="font-mono text-xs" /><Button size="icon" variant="outline" onClick={() => copy(v)}><Copy className="h-4 w-4" /></Button></div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">In OwnTracks: Preferences → Connection. Then press "Start tracking" on the trip.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename stop</DialogTitle></DialogHeader>
          <Input value={editing?.label ?? ""} onChange={(e) => setEditing((x) => x && { ...x, label: e.target.value })} />
          <Button disabled={busy} onClick={() => editing && act(() => locationService.setStopLabel(editing.id, editing.label), "Stop renamed").then(() => setEditing(null))}>Save</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this trip's GPS data?</DialogTitle></DialogHeader>
          <p className="text-sm">All fixes, stops and drives for this trip are permanently removed. The trip and its expenses stay.</p>
          <Button variant="destructive" disabled={busy} onClick={() => act(() => locationService.deleteTripData(trip.id), "GPS data deleted").then(() => setConfirmDelete(false))}>Delete permanently</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
