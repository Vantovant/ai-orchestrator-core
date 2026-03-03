import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { tenderService, type Tender } from "@/services/tenderService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  projectId: string;
}

export default function TenderBriefTab({ projectId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    entity: "", ref_no: "", closing_at: "", briefing_required: false,
    submission_method: "portal", contact: "", status: "identified",
  });

  const query = useQuery({
    queryKey: ["tender", projectId],
    queryFn: () => tenderService.get(projectId),
  });

  const saveMut = useMutation({
    mutationFn: () => tenderService.upsert(projectId, {
      entity: form.entity,
      ref_no: form.ref_no,
      closing_at: form.closing_at ? new Date(form.closing_at).toISOString() : null,
      briefing_required: form.briefing_required,
      submission_method: form.submission_method,
      contact: form.contact || null,
      status: form.status,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tender", projectId] });
      setEditing(false);
      toast.success("Tender brief saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = () => {
    const t = query.data;
    setForm({
      entity: t?.entity || "",
      ref_no: t?.ref_no || "",
      closing_at: t?.closing_at ? format(new Date(t.closing_at), "yyyy-MM-dd'T'HH:mm") : "",
      briefing_required: t?.briefing_required || false,
      submission_method: t?.submission_method || "portal",
      contact: t?.contact || "",
      status: t?.status || "identified",
    });
    setEditing(true);
  };

  if (query.isLoading) return <Skeleton className="h-48" />;

  const tender = query.data;

  if (!editing && !tender) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="text-muted-foreground text-sm">No tender brief yet.</p>
          <Button onClick={startEdit}>Create Tender Brief</Button>
        </CardContent>
      </Card>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tender Details</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Issuing Entity</label>
              <Input value={form.entity} onChange={(e) => setForm(f => ({ ...f, entity: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reference Number</label>
              <Input value={form.ref_no} onChange={(e) => setForm(f => ({ ...f, ref_no: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Closing Date</label>
              <Input type="datetime-local" value={form.closing_at} onChange={(e) => setForm(f => ({ ...f, closing_at: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Contact</label>
              <Input value={form.contact} onChange={(e) => setForm(f => ({ ...f, contact: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Submission Method</label>
              <Select value={form.submission_method} onValueChange={(v) => setForm(f => ({ ...f, submission_method: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="portal">Portal</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="physical">Physical</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="identified">Identified</SelectItem>
                  <SelectItem value="bidding">Bidding</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="awarded">Awarded</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={form.briefing_required} onCheckedChange={(v) => setForm(f => ({ ...f, briefing_required: v }))} />
              <label className="text-sm">Compulsory briefing required</label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-1">
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  const daysLeft = tender?.closing_at ? Math.ceil((new Date(tender.closing_at).getTime() - Date.now()) / 86400000) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Entity</p>
            <p className="text-sm font-semibold">{tender?.entity || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ref #</p>
            <p className="text-sm font-semibold">{tender?.ref_no || "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="capitalize mt-1">{tender?.status}</Badge>
          </CardContent>
        </Card>
      </div>

      {daysLeft !== null && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm">Closing</span>
            <div className="flex items-center gap-2">
              <span className="text-sm">{format(new Date(tender!.closing_at!), "MMM d, yyyy HH:mm")}</span>
              <Badge variant={daysLeft <= 3 ? "destructive" : daysLeft <= 7 ? "outline" : "secondary"}>
                {daysLeft <= 0 ? "Closed" : `${daysLeft}d left`}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {tender?.briefing_required && (
        <Badge variant="outline" className="text-warning border-warning">⚠ Compulsory Briefing Required</Badge>
      )}

      <Button variant="outline" onClick={startEdit}>Edit Brief</Button>
    </div>
  );
}
