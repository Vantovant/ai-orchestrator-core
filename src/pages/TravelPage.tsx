import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plane, Plus, MapPin, Calendar, Trash2, Receipt, Loader2 } from "lucide-react";
import { tripService, tripExpenseService, Trip, TripExpense } from "@/services/travelService";
import { useToast } from "@/hooks/use-toast";

const statusColor: Record<string, string> = {
  upcoming: "bg-primary text-primary-foreground",
  "in-progress": "bg-warning text-warning-foreground",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground line-through",
};

const spendTypeColors: Record<string, string> = {
  business: "bg-warning/10 text-warning",
  personal: "bg-muted text-muted-foreground",
  mixed: "bg-accent/10 text-accent",
};

export default function TravelPage() {
  const { toast } = useToast();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [expensesByTrip, setExpensesByTrip] = useState<Record<string, TripExpense[]>>({});
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [spendType, setSpendType] = useState("personal");
  const [needVsWant, setNeedVsWant] = useState("");
  const [justification, setJustification] = useState("");
  const [budgetedAmount, setBudgetedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [expenseTripId, setExpenseTripId] = useState<string | null>(null);
  const [expLabel, setExpLabel] = useState("");
  const [expAmount, setExpAmount] = useState("");

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const tripRows = await tripService.list();
      setTrips(tripRows);
      const pairs = await Promise.all(
        tripRows.map(async (t) => [t.id, await tripExpenseService.listForTrip(t.id)] as const)
      );
      setExpensesByTrip(Object.fromEntries(pairs));
    } catch (e: any) {
      toast({ title: "Couldn't load trips", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function addTrip() {
    if (!dest || !start || !end) return;
    setSaving(true);
    try {
      const created = await tripService.create({
        destination: dest,
        start_date: start,
        end_date: end,
        spend_type: spendType,
        need_vs_want: needVsWant || null,
        justification: justification.trim() || null,
        budgeted_amount: budgetedAmount ? Number(budgetedAmount) : null,
        notes: notes.trim() || null,
      });
      setTrips((prev) => [...prev, created].sort((a, b) => a.start_date.localeCompare(b.start_date)));
      setExpensesByTrip((prev) => ({ ...prev, [created.id]: [] }));
      setOpen(false);
      setDest(""); setStart(""); setEnd(""); setSpendType("personal");
      setNeedVsWant(""); setJustification(""); setBudgetedAmount(""); setNotes("");
    } catch (e: any) {
      toast({ title: "Couldn't add trip", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function removeTrip(id: string) {
    try {
      await tripService.softDelete(id);
      setTrips((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      toast({ title: "Couldn't remove trip", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  async function addExpense() {
    if (!expenseTripId || !expLabel || !expAmount) return;
    try {
      const created = await tripExpenseService.create({
        trip_id: expenseTripId,
        label: expLabel,
        amount: Number(expAmount),
      });
      setExpensesByTrip((prev) => ({
        ...prev,
        [expenseTripId]: [...(prev[expenseTripId] ?? []), created],
      }));
      setExpenseTripId(null);
      setExpLabel(""); setExpAmount("");
    } catch (e: any) {
      toast({ title: "Couldn't add expense", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Travel</h1>
          <p className="text-sm text-muted-foreground">Manage trips & itineraries</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Trip</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : trips.length === 0 ? (
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
          {trips.map((trip) => {
            const expenses = expensesByTrip[trip.id] ?? [];
            const spent = expenses.reduce((s, e) => s + Number(e.amount), 0);
            const budgeted = trip.budgeted_amount !== null ? Number(trip.budgeted_amount) : null;
            return (
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
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {trip.start_date} → {trip.end_date}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {trip.spend_type !== "personal" && (
                      <Badge variant="secondary" className={spendTypeColors[trip.spend_type] ?? ""}>{trip.spend_type}</Badge>
                    )}
                    {trip.need_vs_want && <Badge variant="outline" className="text-xs">{trip.need_vs_want}</Badge>}
                  </div>
                  {trip.justification && <p className="text-sm text-muted-foreground">{trip.justification}</p>}
                  {trip.notes && <p className="text-sm">{trip.notes}</p>}

                  <div className="rounded-md border border-dashed p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Spent</span>
                      <span className="font-medium">
                        R{spent.toFixed(2)}{budgeted !== null ? ` / R${budgeted.toFixed(2)}` : ""}
                      </span>
                    </div>
                    {expenses.map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                        <span>{e.label}</span>
                        <span>R{Number(e.amount).toFixed(2)}</span>
                      </div>
                    ))}
                    <Button
                      variant="ghost" size="sm" className="mt-2 h-7 gap-1 text-xs"
                      onClick={() => setExpenseTripId(trip.id)}
                    >
                      <Receipt className="h-3.5 w-3.5" /> Add expense
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
            <Input placeholder="Destination" value={dest} onChange={(e) => setDest(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={spendType} onChange={(e) => setSpendType(e.target.value)}>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
                <option value="mixed">Mixed</option>
              </select>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={needVsWant} onChange={(e) => setNeedVsWant(e.target.value)}>
                <option value="">Need or want?</option>
                <option value="need">Need</option>
                <option value="want">Want</option>
              </select>
            </div>
            <Input type="number" placeholder="Budgeted amount (optional)" value={budgetedAmount} onChange={(e) => setBudgetedAmount(e.target.value)} />
            <Textarea
              placeholder="Why this trip? (optional) — purpose or expected return"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={2}
            />
            <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button className="w-full" onClick={addTrip} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Trip"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseTripId !== null} onOpenChange={(o) => !o && setExpenseTripId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Label (e.g. flights, hotel)" value={expLabel} onChange={(e) => setExpLabel(e.target.value)} />
            <Input type="number" placeholder="Amount" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
            <Button className="w-full" onClick={addExpense}>Add Expense</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
