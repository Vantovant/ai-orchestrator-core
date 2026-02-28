import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plane, Plus, MapPin, Calendar, Trash2 } from "lucide-react";

interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: "upcoming" | "in-progress" | "completed";
  notes: string;
}

const statusColor: Record<string, string> = {
  upcoming: "bg-primary text-primary-foreground",
  "in-progress": "bg-warning text-warning-foreground",
  completed: "bg-muted text-muted-foreground",
};

export default function TravelPage() {
  const [trips, setTrips] = useState<Trip[]>([
    { id: "1", destination: "Cape Town, SA", startDate: "2026-03-15", endDate: "2026-03-20", status: "upcoming", notes: "Client meeting + site visit" },
    { id: "2", destination: "Johannesburg, SA", startDate: "2026-04-02", endDate: "2026-04-04", status: "upcoming", notes: "Conference" },
  ]);
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");

  const addTrip = () => {
    if (!dest || !start || !end) return;
    setTrips(prev => [...prev, { id: crypto.randomUUID(), destination: dest, startDate: start, endDate: end, status: "upcoming", notes }]);
    setOpen(false); setDest(""); setStart(""); setEnd(""); setNotes("");
  };

  const removeTrip = (id: string) => setTrips(prev => prev.filter(t => t.id !== id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Travel</h1>
          <p className="text-sm text-muted-foreground">Manage trips & itineraries</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Trip</Button>
      </div>

      {trips.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Plane className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No trips planned</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Add your first trip to start tracking travel.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trips.map(trip => (
            <Card key={trip.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">{trip.destination}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className={statusColor[trip.status]}>{trip.status}</Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeTrip(trip.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                  <Calendar className="h-3.5 w-3.5" />
                  {trip.startDate} → {trip.endDate}
                </div>
                {trip.notes && <p className="text-sm">{trip.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-dashed">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <p>✈️ Email-to-itinerary import coming soon — flights, hotels, and bookings auto-extracted from your inbox.</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Trip</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Destination" value={dest} onChange={e => setDest(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
              <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
            </div>
            <Input placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
            <Button className="w-full" onClick={addTrip}>Add Trip</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
