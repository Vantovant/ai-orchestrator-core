import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tenderService, tenderComplianceService, type TenderComplianceItem } from "@/services/tenderService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";

interface Props {
  projectId: string;
}

export default function TenderComplianceTab({ projectId }: Props) {
  const qc = useQueryClient();
  const [newItem, setNewItem] = useState("");

  const tender = useQuery({
    queryKey: ["tender", projectId],
    queryFn: () => tenderService.get(projectId),
  });

  const tenderId = tender.data?.id;

  const items = useQuery({
    queryKey: ["tender_compliance", tenderId],
    queryFn: () => tenderComplianceService.list(tenderId!),
    enabled: !!tenderId,
  });

  const createMut = useMutation({
    mutationFn: () => tenderComplianceService.create(tenderId!, newItem.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tender_compliance", tenderId] });
      setNewItem("");
      toast.success("Item added");
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, currentStatus }: { id: string; currentStatus: string }) =>
      tenderComplianceService.update(id, { status: currentStatus === "uploaded" ? "missing" : "uploaded" } as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tender_compliance", tenderId] }),
  });

  if (tender.isLoading || items.isLoading) return <Skeleton className="h-48" />;

  if (!tenderId) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
        Create a tender brief first to manage compliance.
      </CardContent></Card>
    );
  }

  const list = items.data || [];
  const uploaded = list.filter(i => i.status === "uploaded").length;
  const required = list.filter(i => i.required).length;

  return (
    <div className="space-y-4">
      {list.length > 0 && (
        <Badge variant={uploaded === required ? "default" : "outline"}>
          {uploaded}/{required} required docs attached
        </Badge>
      )}

      <div className="space-y-1.5">
        {list.map(item => (
          <Card key={item.id} className="cursor-pointer" onClick={() => toggleMut.mutate({ id: item.id, currentStatus: item.status })}>
            <CardContent className="flex items-center gap-3 p-3">
              {item.status === "uploaded" ? (
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className="text-sm">{item.item_name}</span>
                {item.required && <Badge variant="outline" className="ml-2 text-[10px]">Required</Badge>}
              </div>
              {item.expires_at && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {differenceInDays(new Date(item.expires_at), new Date()) <= 30 ? (
                    <span className="text-warning">Expires {format(new Date(item.expires_at), "MMM d")}</span>
                  ) : (
                    format(new Date(item.expires_at), "MMM d")
                  )}
                </span>
              )}
              <Badge variant={item.status === "uploaded" ? "default" : "secondary"} className="text-[10px] capitalize">
                {item.status}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) createMut.mutate(); }}>
        <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add compliance item..." className="h-8 text-sm" />
        <Button type="submit" size="sm"><Plus className="h-3.5 w-3.5" /></Button>
      </form>
    </div>
  );
}
