import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ShoppingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shopping</h1>
          <p className="text-sm text-muted-foreground">Smart shopping lists and purchase tracking</p>
        </div>
        <Button size="sm" className="gap-1" disabled>
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <ShoppingCart className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Shopping Lists</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            AI-powered shopping lists, price comparisons, and purchase history coming soon.
          </p>
          <Badge variant="secondary" className="mt-4">Coming Soon</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
