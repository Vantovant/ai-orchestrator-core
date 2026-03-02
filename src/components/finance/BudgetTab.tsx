import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { budgetItemService, budgetEventService, type BudgetItem, type BudgetEvent } from "@/services/budgetService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, AlertTriangle, Check, CreditCard, Calendar, Clock, Trash2, Edit2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, addDays } from "date-fns";

const fmt = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Add Budget Item Dialog ──
function AddBudgetItemDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("subscription");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [dueDay, setDueDay] = useState("");
  const [dueMonth, setDueMonth] = useState("");
  const [category, setCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [autopay, setAutopay] = useState(false);
  const [notifyDays, setNotifyDays] = useState("7");

  const mut = useMutation({
    mutationFn: () => budgetItemService.create({
      type, name, description, amount: parseFloat(amount), cadence,
      due_day_of_month: dueDay ? parseInt(dueDay) : null,
      due_month_of_year: dueMonth ? parseInt(dueMonth) : null,
      category: category || null, vendor: vendor || null,
      autopay, notify_days_before: parseInt(notifyDays) || 7,
    }),
    onSuccess: () => {
      onCreated();
      setOpen(false);
      setName(""); setDescription(""); setAmount("");
      toast.success("Budget item added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Item</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Budget Item</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="subscription">Subscription</SelectItem><SelectItem value="instalment">Instalment</SelectItem></SelectContent></Select>
            </div>
            <div>
              <Label className="text-xs">Cadence</Label>
              <Select value={cadence} onValueChange={setCadence}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="yearly">Yearly</SelectItem><SelectItem value="weekly">Weekly</SelectItem><SelectItem value="quarterly">Quarterly</SelectItem></SelectContent></Select>
            </div>
          </div>
          <Input placeholder="Name (e.g. Netflix, Car Payment)" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input placeholder="Description (what is it for?)" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" placeholder="Amount (ZAR)" value={amount} onChange={(e) => setAmount(e.target.value)} required min="0" step="0.01" />
            <Input type="number" placeholder="Due day (1-31)" value={dueDay} onChange={(e) => setDueDay(e.target.value)} min="1" max="31" />
          </div>
          {(cadence === "yearly") && (
            <Input type="number" placeholder="Due month (1-12)" value={dueMonth} onChange={(e) => setDueMonth(e.target.value)} min="1" max="12" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
            <Input placeholder="Vendor (optional)" value={vendor} onChange={(e) => setVendor(e.target.value)} />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch checked={autopay} onCheckedChange={setAutopay} id="autopay" />
              <Label htmlFor="autopay" className="text-sm">Autopay</Label>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Warn days before:</Label>
              <Input type="number" className="w-16 h-8" value={notifyDays} onChange={(e) => setNotifyDays(e.target.value)} min="0" max="30" />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={mut.isPending}>{mut.isPending ? "Saving..." : "Add Budget Item"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Item Detail Drawer ──
function ItemDetailDrawer({ item, open, onClose, onUpdated }: { item: BudgetItem | null; open: boolean; onClose: () => void; onUpdated: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");

  const startEdit = useCallback(() => {
    if (!item) return;
    setName(item.name); setAmount(String(item.amount)); setDescription(item.description || ""); setStatus(item.status);
    setEditing(true);
  }, [item]);

  const updateMut = useMutation({
    mutationFn: () => budgetItemService.update(item!.id, { name, amount: parseFloat(amount), description, status }),
    onSuccess: () => { onUpdated(); setEditing(false); toast.success("Updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: () => budgetItemService.softDelete(item!.id),
    onSuccess: () => { onUpdated(); onClose(); toast.success("Deleted"); },
  });

  if (!item) return null;

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DrawerContent>
        <DrawerHeader className="flex items-center justify-between">
          <DrawerTitle>{item.name}</DrawerTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" onClick={startEdit}><Edit2 className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteMut.mutate()}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </DrawerHeader>
        <div className="p-4 space-y-3">
          {editing ? (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); updateMut.mutate(); }}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" />
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
              <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Paused</SelectItem><SelectItem value="ended">Ended</SelectItem></SelectContent></Select>
              <div className="flex gap-2">
                <Button type="submit" disabled={updateMut.isPending}>Save</Button>
                <Button variant="outline" type="button" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Type:</span> <Badge variant="outline">{item.type}</Badge></div>
                <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">{fmt(Number(item.amount))}</span></div>
                <div><span className="text-muted-foreground">Cadence:</span> {item.cadence}</div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant={item.status === "active" ? "default" : "secondary"}>{item.status}</Badge></div>
                {item.due_day_of_month && <div><span className="text-muted-foreground">Due day:</span> {item.due_day_of_month}</div>}
                {item.due_month_of_year && <div><span className="text-muted-foreground">Due month:</span> {item.due_month_of_year}</div>}
                {item.category && <div><span className="text-muted-foreground">Category:</span> {item.category}</div>}
                {item.vendor && <div><span className="text-muted-foreground">Vendor:</span> {item.vendor}</div>}
                <div><span className="text-muted-foreground">Autopay:</span> {item.autopay ? "Yes" : "No"}</div>
                <div><span className="text-muted-foreground">Warn:</span> {item.notify_days_before} days</div>
              </div>
              {item.description && <p className="text-sm text-muted-foreground border-t pt-2">{item.description}</p>}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ── Main Budget Tab ──
export default function BudgetTab() {
  const qc = useQueryClient();
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const monthStr = format(viewMonth, "yyyy-MM");
  const fromDate = format(startOfMonth(viewMonth), "yyyy-MM-dd");
  const toDate = format(endOfMonth(viewMonth), "yyyy-MM-dd");
  const today = format(new Date(), "yyyy-MM-dd");
  const weekFromNow = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const items = useQuery({ queryKey: ["budget_items"], queryFn: budgetItemService.list });
  const events = useQuery({
    queryKey: ["budget_events", monthStr],
    queryFn: () => budgetEventService.listForRange(fromDate, toDate),
  });

  const generateMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("budget-generate-events", {
        body: { from_date: fromDate, to_date: toDate },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["budget_events"] });
      toast.success(`Generated ${data?.created ?? 0} events`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const markPaidMut = useMutation({
    mutationFn: budgetEventService.markPaid,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["budget_events"] }); toast.success("Marked paid"); },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["budget_items"] });
    qc.invalidateQueries({ queryKey: ["budget_events"] });
  };

  const activeItems = (items.data ?? []).filter((i) => i.status === "active");
  const subscriptions = activeItems.filter((i) => i.type === "subscription");
  const instalments = activeItems.filter((i) => i.type === "instalment");

  const monthlySubTotal = subscriptions.filter((i) => i.cadence === "monthly").reduce((s, i) => s + Number(i.amount), 0);
  const monthlyInstTotal = instalments.filter((i) => i.cadence === "monthly").reduce((s, i) => s + Number(i.amount), 0);
  const yearlyTotal = activeItems.filter((i) => i.cadence === "yearly").reduce((s, i) => s + Number(i.amount), 0);

  const upcomingEvents = (events.data ?? []).filter((e) => e.due_at >= today && e.due_at <= weekFromNow && e.status !== "paid");

  const next7Total = upcomingEvents.reduce((s, e) => s + Number(e.amount), 0);

  const openItem = (item: BudgetItem) => { setSelectedItem(item); setDrawerOpen(true); };

  return (
    <div className="space-y-4">
      {/* Month Nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setViewMonth(subMonths(viewMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-medium text-sm">{format(viewMonth, "MMMM yyyy")}</span>
          <Button variant="ghost" size="icon" onClick={() => setViewMonth(addMonths(viewMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => generateMut.mutate()} disabled={generateMut.isPending}>
            {generateMut.isPending ? "Generating..." : "Generate Events"}
          </Button>
          <AddBudgetItemDialog onCreated={invalidateAll} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Monthly Subs</p><p className="text-lg font-bold">{fmt(monthlySubTotal)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Monthly Instalments</p><p className="text-lg font-bold">{fmt(monthlyInstTotal)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Yearly Items</p><p className="text-lg font-bold">{fmt(yearlyTotal)}</p></CardContent></Card>
        <Card className={next7Total > 0 ? "border-warning/50" : ""}><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Due Next 7 Days</p><p className="text-lg font-bold">{fmt(next7Total)}</p></CardContent></Card>
      </div>

      {/* 7-Day Warnings */}
      {upcomingEvents.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> Upcoming in 7 Days</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {upcomingEvents.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{(ev as any).budget_item?.name ?? "Item"}</p>
                  <p className="text-xs text-muted-foreground">{ev.due_at} · {(ev as any).budget_item?.type} · {(ev as any).budget_item?.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{fmt(Number(ev.amount))}</span>
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => markPaidMut.mutate(ev.id)}><Check className="h-3 w-3" /> Paid</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Subscriptions */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" /> Subscriptions ({subscriptions.length})</CardTitle></CardHeader>
        <CardContent>
          {items.isLoading ? <Skeleton className="h-16" /> : subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No subscriptions yet.</p>
          ) : (
            <div className="space-y-2">
              {subscriptions.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50" onClick={() => openItem(item)}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.cadence} · Day {item.due_day_of_month ?? "—"}{item.description ? ` · ${item.description}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{fmt(Number(item.amount))}</span>
                    {item.autopay && <Badge variant="outline" className="text-xs">Auto</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instalments */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Instalments ({instalments.length})</CardTitle></CardHeader>
        <CardContent>
          {items.isLoading ? <Skeleton className="h-16" /> : instalments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No instalments yet.</p>
          ) : (
            <div className="space-y-2">
              {instalments.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/50" onClick={() => openItem(item)}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.cadence} · Day {item.due_day_of_month ?? "—"}{item.description ? ` · ${item.description}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{fmt(Number(item.amount))}</span>
                    {item.category && <Badge variant="outline" className="text-xs">{item.category}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* This Month Events */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Events This Month</CardTitle></CardHeader>
        <CardContent>
          {events.isLoading ? <Skeleton className="h-16" /> : (events.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No events. Click "Generate Events" to create occurrences.</p>
          ) : (
            <div className="space-y-2">
              {(events.data ?? []).map((ev) => (
                <div key={ev.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{(ev as any).budget_item?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{ev.due_at}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{fmt(Number(ev.amount))}</span>
                    <Badge variant={ev.status === "paid" ? "default" : ev.status === "overdue" ? "destructive" : "secondary"} className="text-xs">{ev.status}</Badge>
                    {ev.status !== "paid" && (
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => markPaidMut.mutate(ev.id)}>Paid</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ItemDetailDrawer item={selectedItem} open={drawerOpen} onClose={() => setDrawerOpen(false)} onUpdated={invalidateAll} />
    </div>
  );
}
