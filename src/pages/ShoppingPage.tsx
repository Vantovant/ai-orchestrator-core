import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShoppingCart, Plus, Trash2, RotateCcw, Loader2 } from "lucide-react";
import { shoppingItemService, ShoppingItem } from "@/services/shoppingService";
import { trustedSourceService, TrustedSource } from "@/services/trustedSourceService";
import { useToast } from "@/hooks/use-toast";

const categoryColors: Record<string, string> = {
  groceries: "bg-success/10 text-success",
  household: "bg-primary/10 text-primary",
  personal: "bg-accent/10 text-accent",
  other: "bg-muted text-muted-foreground",
};

const spendTypeColors: Record<string, string> = {
  business: "bg-warning/10 text-warning",
  personal: "bg-muted text-muted-foreground",
  mixed: "bg-accent/10 text-accent",
};

export default function ShoppingPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [sources, setSources] = useState<TrustedSource[]>([]);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [cat, setCat] = useState("other");
  const [spendType, setSpendType] = useState("personal");
  const [needVsWant, setNeedVsWant] = useState<string>("");
  const [justification, setJustification] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [trustedSourceId, setTrustedSourceId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [itemRows, sourceRows] = await Promise.all([
        shoppingItemService.list(),
        trustedSourceService.list(),
      ]);
      setItems(itemRows);
      setSources(sourceRows);
    } catch (e: any) {
      toast({ title: "Couldn't load shopping list", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function addItem() {
    if (!name) return;
    setSaving(true);
    try {
      const created = await shoppingItemService.create({
        name,
        quantity: parseInt(qty) || 1,
        category: cat,
        spend_type: spendType,
        need_vs_want: needVsWant || null,
        justification: justification.trim() || null,
        is_recurring: recurring,
        trusted_source_id: trustedSourceId || null,
      });
      setItems((prev) => [created, ...prev]);
      setOpen(false);
      setName(""); setQty("1"); setCat("other"); setSpendType("personal");
      setNeedVsWant(""); setJustification(""); setRecurring(false); setTrustedSourceId("");
    } catch (e: any) {
      toast({ title: "Couldn't add item", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(item: ShoppingItem) {
    try {
      const updated = await shoppingItemService.toggleDone(item.id, !item.is_done);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch (e: any) {
      toast({ title: "Couldn't update item", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  async function removeItem(id: string) {
    try {
      await shoppingItemService.softDelete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e: any) {
      toast({ title: "Couldn't remove item", description: e?.message ?? String(e), variant: "destructive" });
    }
  }

  const pending = items.filter((i) => !i.is_done);
  const done = items.filter((i) => i.is_done);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shopping</h1>
          <p className="text-sm text-muted-foreground">Lists & recurring items</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Item</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <ShoppingCart className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No items yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Start building your shopping list.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">To Buy ({pending.length})</h2>
              {pending.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex items-center justify-between p-4 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" checked={false} onChange={() => toggleDone(item)} className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.name}</span>
                          <span className="text-xs text-muted-foreground">×{item.quantity}</span>
                        </div>
                        {item.justification && (
                          <p className="text-xs text-muted-foreground truncate">{item.justification}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.is_recurring && <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />}
                      {item.need_vs_want && (
                        <Badge variant="outline" className="text-xs">{item.need_vs_want}</Badge>
                      )}
                      {item.spend_type !== "personal" && (
                        <Badge variant="secondary" className={spendTypeColors[item.spend_type] ?? ""}>{item.spend_type}</Badge>
                      )}
                      <Badge variant="secondary" className={categoryColors[item.category] ?? ""}>{item.category}</Badge>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">Done ({done.length})</h2>
              {done.map((item) => (
                <Card key={item.id} className="opacity-60">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" checked onChange={() => toggleDone(item)} className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium line-through">{item.name}</span>
                      {item.actual_cost !== null && (
                        <span className="text-xs text-muted-foreground">R{Number(item.actual_cost).toFixed(2)}</span>
                      )}
                      {item.finance_entry_id && (
                        <Badge variant="outline" className="text-xs">logged to Finance</Badge>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Card className="border-dashed">
        <CardContent className="p-4 text-center text-sm text-muted-foreground">
          <p>Ask Claude to log a completed item's cost to Finance, or to review this week's list against your budget.</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min="1" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="groceries">Groceries</option>
                <option value="household">Household</option>
                <option value="personal">Personal</option>
                <option value="other">Other</option>
              </select>
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
            {sources.length > 0 && (
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={trustedSourceId} onChange={(e) => setTrustedSourceId(e.target.value)}>
                <option value="">No trusted source</option>
                {sources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.is_preferred ? " ★" : ""}</option>
                ))}
              </select>
            )}
            <Textarea
              placeholder="Why? (optional) — what it's for, or how it profits you"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={2}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              Recurring item
            </label>
            <Button className="w-full" onClick={addItem} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
