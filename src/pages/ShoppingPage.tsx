import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShoppingCart, Plus, Trash2, RotateCcw } from "lucide-react";

interface ShoppingItem {
  id: string;
  name: string;
  quantity: number;
  category: string;
  isRecurring: boolean;
  isDone: boolean;
}

const categoryColors: Record<string, string> = {
  groceries: "bg-success/10 text-success",
  household: "bg-primary/10 text-primary",
  personal: "bg-accent/10 text-accent",
  other: "bg-muted text-muted-foreground",
};

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([
    { id: "1", name: "Coffee beans", quantity: 1, category: "groceries", isRecurring: true, isDone: false },
    { id: "2", name: "Printer paper", quantity: 2, category: "household", isRecurring: false, isDone: false },
    { id: "3", name: "USB-C cable", quantity: 1, category: "other", isRecurring: false, isDone: true },
  ]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [cat, setCat] = useState("other");
  const [recurring, setRecurring] = useState(false);

  const addItem = () => {
    if (!name) return;
    setItems(prev => [...prev, { id: crypto.randomUUID(), name, quantity: parseInt(qty) || 1, category: cat, isRecurring: recurring, isDone: false }]);
    setOpen(false); setName(""); setQty("1"); setCat("other"); setRecurring(false);
  };

  const toggleDone = (id: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, isDone: !i.isDone } : i));
  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const pending = items.filter(i => !i.isDone);
  const done = items.filter(i => i.isDone);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shopping</h1>
          <p className="text-sm text-muted-foreground">Lists & recurring items</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Item</Button>
      </div>

      {items.length === 0 ? (
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
              {pending.map(item => (
                <Card key={item.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" checked={false} onChange={() => toggleDone(item.id)} className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{item.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">×{item.quantity}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.isRecurring && <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />}
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
              {done.map(item => (
                <Card key={item.id} className="opacity-60">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <input type="checkbox" checked onChange={() => toggleDone(item.id)} className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium line-through">{item.name}</span>
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
          <p>🔗 Budget category linking coming soon — track shopping spend against Finance categories.</p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Item</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Item name" value={name} onChange={e => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min="1" placeholder="Qty" value={qty} onChange={e => setQty(e.target.value)} />
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={cat} onChange={e => setCat(e.target.value)}>
                <option value="groceries">Groceries</option>
                <option value="household">Household</option>
                <option value="personal">Personal</option>
                <option value="other">Other</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
              Recurring item
            </label>
            <Button className="w-full" onClick={addItem}>Add Item</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
