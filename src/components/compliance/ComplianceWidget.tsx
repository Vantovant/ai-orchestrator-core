import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { complianceService, SA_COMPLIANCE_PRESETS, type ComplianceReminderInsert } from "@/services/complianceService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Plus, AlertTriangle, CheckCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function ComplianceWidget({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const reminders = useQuery({ queryKey: ["compliance_reminders"], queryFn: complianceService.list });

  const [open, setOpen] = useState(false);
  const [type, setType] = useState("custom");
  const [label, setLabel] = useState("");
  const [dueDate, setDueDate] = useState("");

  const createMut = useMutation({
    mutationFn: (r: ComplianceReminderInsert) => complianceService.create(r),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compliance_reminders"] }); setOpen(false); setLabel(""); setDueDate(""); toast.success("Compliance reminder added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_done }: { id: string; is_done: boolean }) => complianceService.toggleDone(id, is_done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance_reminders"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => complianceService.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["compliance_reminders"] }); toast.success("Removed"); },
  });

  const handlePreset = (preset: typeof SA_COMPLIANCE_PRESETS[0]) => {
    setType(preset.type);
    setLabel(preset.label);
    const now = new Date();
    const year = now.getFullYear();
    if (preset.defaultMonth && preset.defaultDay) {
      let d = new Date(year, preset.defaultMonth - 1, preset.defaultDay);
      if (d < now) d = new Date(year + 1, preset.defaultMonth - 1, preset.defaultDay);
      setDueDate(d.toISOString().slice(0, 10));
    }
  };

  const now = new Date();
  const upcoming = (reminders.data ?? []).filter((r) => !r.is_done);
  const overdue = upcoming.filter((r) => new Date(r.due_date) < now);
  const soon = upcoming.filter((r) => {
    const d = new Date(r.due_date);
    return d >= now && d.getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000;
  });

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Compliance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reminders.isLoading ? <Skeleton className="h-8" /> : (
            <div className="flex items-center gap-3">
              {overdue.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {overdue.length} overdue
                </Badge>
              )}
              {soon.length > 0 && (
                <Badge variant="outline" className="gap-1 border-warning text-warning">
                  {soon.length} due soon
                </Badge>
              )}
              {overdue.length === 0 && soon.length === 0 && (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle className="h-3 w-3" /> All clear
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Compliance Center
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Compliance Reminder</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-2">SA Presets:</p>
                <div className="flex flex-wrap gap-1">
                  {SA_COMPLIANCE_PRESETS.map((p, i) => (
                    <Button key={i} variant="outline" size="sm" className="text-xs" onClick={() => handlePreset(p)}>
                      {p.label.length > 25 ? p.label.slice(0, 25) + "…" : p.label}
                    </Button>
                  ))}
                </div>
              </div>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createMut.mutate({ type, label, due_date: dueDate }); }}>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sars_provisional">SARS Provisional Tax</SelectItem>
                    <SelectItem value="vat_return">VAT Return</SelectItem>
                    <SelectItem value="paye">PAYE</SelectItem>
                    <SelectItem value="uif">UIF</SelectItem>
                    <SelectItem value="annual_return">Annual Return</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} required />
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
                <Button type="submit" className="w-full" disabled={createMut.isPending}>
                  {createMut.isPending ? "Adding..." : "Add Reminder"}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground italic">
                Reminder only — not legal or tax advice. Consult your tax practitioner for specific dates.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {reminders.isLoading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No compliance reminders set. Add SARS, VAT, or PAYE deadlines.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((r) => {
              const isOverdue = new Date(r.due_date) < now;
              return (
                <div key={r.id} className={`flex items-center justify-between rounded-lg border p-3 ${isOverdue ? "border-destructive/50 bg-destructive/5" : "border-border"}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={r.is_done}
                      onChange={() => toggleMut.mutate({ id: r.id, is_done: !r.is_done })}
                      className="h-4 w-4 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{r.label}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-xs">{r.type}</Badge>
                        <span className={`text-xs ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {isOverdue ? "OVERDUE — " : ""}Due {r.due_date}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
