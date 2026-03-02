import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { partnerMemoryService, type PartnerMemory } from "@/services/partnerMemoryService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Brain, Edit3, RefreshCw, Loader2, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";

const stages = ["idea", "mvp", "beta", "live", "scaling"];

interface Props {
  projectId: string;
  projectName: string;
}

export default function PartnerMemoryPanel({ projectId, projectName }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<PartnerMemory>>({});
  const [aiUpdating, setAiUpdating] = useState(false);
  const [aiDiff, setAiDiff] = useState<any>(null);

  const memory = useQuery({
    queryKey: ["partner_memory", projectId],
    queryFn: () => partnerMemoryService.get(projectId),
  });

  const saveMut = useMutation({
    mutationFn: (fields: Partial<PartnerMemory>) => partnerMemoryService.upsert(projectId, fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner_memory", projectId] });
      setEditing(false);
      toast.success("Memory saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = () => {
    const m = memory.data;
    setEditData({
      north_star: m?.north_star ?? "",
      target_customer: m?.target_customer ?? "",
      business_model: m?.business_model ?? "",
      stage: m?.stage ?? "mvp",
      primary_constraint: m?.primary_constraint ?? "",
      weekly_focus: m?.weekly_focus ?? "",
    });
    setEditing(true);
  };

  const handleAiUpdate = async () => {
    setAiUpdating(true);
    try {
      const { data, error } = await supabase.functions.invoke("project-ai-partner", {
        body: { project_id: projectId, mode: "update_memory" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAiDiff(data?.result);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate memory update");
    }
    setAiUpdating(false);
  };

  const applyAiDiff = () => {
    if (!aiDiff) return;
    const patch: any = {};
    for (const key of ["north_star", "target_customer", "business_model", "stage", "primary_constraint", "weekly_focus", "last_partner_summary"]) {
      if (aiDiff[key]) patch[key] = aiDiff[key];
    }
    if (aiDiff.key_assumptions) patch.key_assumptions = aiDiff.key_assumptions;
    if (aiDiff.key_risks) patch.key_risks = aiDiff.key_risks;
    saveMut.mutate(patch);
    setAiDiff(null);
  };

  const m = memory.data;
  const isEmpty = !m || (!m.north_star && !m.target_customer && !m.business_model);

  const handleToggleAutoUpdate = () => {
    saveMut.mutate({ auto_update_enabled: !m?.auto_update_enabled });
  };

  return (
    <>
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" /> Partner Memory
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={startEdit}>
                <Edit3 className="h-3 w-3" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={handleAiUpdate} disabled={aiUpdating}>
                {aiUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                AI Update
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isEmpty ? (
            <p className="text-xs text-muted-foreground py-2">No memory set yet. Click "Edit" to define your project's North Star, target customer, and strategy.</p>
          ) : (
            <div className="grid gap-2 text-xs">
              {m?.north_star && <MemoryField label="North Star" value={m.north_star} />}
              {m?.target_customer && <MemoryField label="Target Customer" value={m.target_customer} />}
              {m?.business_model && <MemoryField label="Business Model" value={m.business_model} />}
              <div className="flex gap-2 flex-wrap">
                {m?.stage && <Badge variant="secondary" className="text-[10px] capitalize">{m.stage}</Badge>}
                {m?.primary_constraint && <Badge variant="outline" className="text-[10px]">Constraint: {m.primary_constraint}</Badge>}
              </div>
              {m?.weekly_focus && <MemoryField label="This Week" value={m.weekly_focus} />}
              {m?.last_partner_summary && <MemoryField label="AI Summary" value={m.last_partner_summary} />}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1 border-t">
            <Switch checked={m?.auto_update_enabled ?? false} onCheckedChange={handleToggleAutoUpdate} className="scale-75" />
            <span className="text-[10px] text-muted-foreground">Allow AI to update memory after sessions</span>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-sm">Edit Partner Memory</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">North Star</label>
              <Input value={editData.north_star ?? ""} onChange={e => setEditData(p => ({ ...p, north_star: e.target.value }))} placeholder="What's the ultimate goal?" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Target Customer</label>
              <Input value={editData.target_customer ?? ""} onChange={e => setEditData(p => ({ ...p, target_customer: e.target.value }))} placeholder="Who are you building for?" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Business Model</label>
              <Input value={editData.business_model ?? ""} onChange={e => setEditData(p => ({ ...p, business_model: e.target.value }))} placeholder="How do you make money?" className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Stage</label>
              <Select value={editData.stage ?? "mvp"} onValueChange={v => setEditData(p => ({ ...p, stage: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Primary Constraint</label>
              <Input value={editData.primary_constraint ?? ""} onChange={e => setEditData(p => ({ ...p, primary_constraint: e.target.value }))} placeholder="time, money, tech, team..." className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Weekly Focus</label>
              <Textarea value={editData.weekly_focus ?? ""} onChange={e => setEditData(p => ({ ...p, weekly_focus: e.target.value }))} rows={2} className="text-sm" placeholder="What's the focus this week?" />
            </div>
            <Button className="w-full" size="sm" onClick={() => saveMut.mutate(editData)} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving..." : "Save Memory"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Diff Dialog */}
      <Dialog open={!!aiDiff} onOpenChange={() => setAiDiff(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-sm">AI Memory Update Proposal</DialogTitle></DialogHeader>
          {aiDiff && (
            <div className="space-y-2">
              {Object.entries(aiDiff).filter(([_, v]) => v).map(([key, value]) => (
                <div key={key} className="p-2 rounded-lg bg-muted/30">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">{key.replace(/_/g, " ")}</span>
                  <p className="text-xs mt-0.5">{typeof value === "string" ? value : JSON.stringify(value)}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <Button className="flex-1" size="sm" onClick={applyAiDiff} disabled={saveMut.isPending}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Apply
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAiDiff(null)}>
                  <X className="h-3 w-3 mr-1" /> Dismiss
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function MemoryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</span>
      <p className="text-xs">{value}</p>
    </div>
  );
}
