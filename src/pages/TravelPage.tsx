import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plane, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TravelPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Travel</h1>
          <p className="text-sm text-muted-foreground">Manage itineraries, flights, and travel plans</p>
        </div>
        <Button size="sm" className="gap-1" disabled>
          <Plus className="h-4 w-4" /> Add Trip
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Plane className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Travel Manager</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Flight tracking, hotel bookings, and AI-generated itineraries coming soon.
          </p>
          <Badge variant="secondary" className="mt-4">Coming Soon</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
