import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  HeartPulse, Plus, Scale, FileText, BookHeart, Download, Trash2, Upload, TrendingDown,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import {
  getMetrics, addMetric, deleteMetric, type WellnessMetric,
  getDocuments, addDocument, deleteDocument, getDocumentDownloadUrl, type WellnessDocument, type WellnessDocCategory,
  getJournalEntries, addJournalEntry, deleteJournalEntry, type WellnessJournalEntry,
} from "@/services/wellnessService";

const CATEGORY_LABELS: Record<WellnessDocCategory, string> = {
  lab_results: "Lab Results",
  consultation: "Consultation",
  imaging: "Imaging / Scan",
  prescription: "Prescription",
  other: "Other",
};

export default function WellnessPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HeartPulse className="h-6 w-6 text-primary" /> Wellness & Health
        </h1>
        <p className="text-sm text-muted-foreground">
          Weight & vitals, doctor's reports, and your wellness journal — all in one place.
        </p>
      </div>

      <Tabs defaultValue="metrics">
        <TabsList>
          <TabsTrigger value="metrics" className="gap-1"><Scale className="h-3.5 w-3.5" /> Weight & Vitals</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1"><FileText className="h-3.5 w-3.5" /> Doctor's Reports</TabsTrigger>
          <TabsTrigger value="journal" className="gap-1"><BookHeart className="h-3.5 w-3.5" /> Journal</TabsTrigger>
        </TabsList>

        <TabsContent value="metrics" className="pt-4"><MetricsTab /></TabsContent>
        <TabsContent value="documents" className="pt-4"><DocumentsTab /></TabsContent>
        <TabsContent value="journal" className="pt-4"><JournalTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Weight & Vitals ───────────────────────────────────────────────────────

function MetricsTab() {
  const [rows, setRows] = useState<WellnessMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    recorded_on: new Date().toISOString().slice(0, 10),
    weight_kg: "", waist_cm: "", systolic_bp: "", diastolic_bp: "", resting_hr: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    try { setRows(await getMetrics()); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await addMetric({
        recorded_on: form.recorded_on,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        waist_cm: form.waist_cm ? Number(form.waist_cm) : null,
        systolic_bp: form.systolic_bp ? Number(form.systolic_bp) : null,
        diastolic_bp: form.diastolic_bp ? Number(form.diastolic_bp) : null,
        resting_hr: form.resting_hr ? Number(form.resting_hr) : null,
        notes: form.notes || null,
      });
      toast.success("Entry logged");
      setOpen(false);
      setForm({ recorded_on: new Date().toISOString().slice(0, 10), weight_kg: "", waist_cm: "", systolic_bp: "", diastolic_bp: "", resting_hr: "", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const chartData = [...rows]
    .filter((r) => r.weight_kg != null)
    .reverse()
    .map((r) => ({ date: format(parseISO(r.recorded_on), "MMM d"), weight: r.weight_kg }));

  const latest = rows[0];
  const earliest = rows[rows.length - 1];
  const trend = latest?.weight_kg != null && earliest?.weight_kg != null
    ? (latest.weight_kg - earliest.weight_kg)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {latest?.weight_kg != null && (
            <Card className="px-4 py-2"><div className="text-xs text-muted-foreground">Latest weight</div><div className="text-lg font-semibold">{latest.weight_kg} kg</div></Card>
          )}
          {trend != null && (
            <Card className="px-4 py-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Change (period)</div>
              <div className={`text-lg font-semibold ${trend <= 0 ? "text-emerald-600" : "text-amber-600"}`}>{trend > 0 ? "+" : ""}{trend.toFixed(1)} kg</div>
            </Card>
          )}
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Log Entry</Button>
      </div>

      {chartData.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Weight trend</CardTitle></CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis fontSize={11} domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip />
                <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No entries yet. Log your first weight or vitals reading.</CardContent></Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <Card key={r.id} className="group">
              <CardContent className="py-2.5 px-4 flex items-center gap-4 text-sm">
                <div className="w-24 text-muted-foreground text-xs">{format(parseISO(r.recorded_on), "MMM d, yyyy")}</div>
                {r.weight_kg != null && <Badge variant="secondary">{r.weight_kg} kg</Badge>}
                {r.waist_cm != null && <Badge variant="outline">waist {r.waist_cm} cm</Badge>}
                {(r.systolic_bp != null && r.diastolic_bp != null) && <Badge variant="outline">{r.systolic_bp}/{r.diastolic_bp} mmHg</Badge>}
                {r.resting_hr != null && <Badge variant="outline">HR {r.resting_hr}</Badge>}
                {r.notes && <span className="text-xs text-muted-foreground truncate flex-1">{r.notes}</span>}
                <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                  onClick={async () => { await deleteMetric(r.id); load(); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log weight & vitals</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={form.recorded_on} onChange={(e) => setForm((f) => ({ ...f, recorded_on: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Weight (kg)</Label><Input type="number" step="0.1" value={form.weight_kg} onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))} /></div>
              <div><Label className="text-xs">Waist (cm)</Label><Input type="number" step="0.1" value={form.waist_cm} onChange={(e) => setForm((f) => ({ ...f, waist_cm: e.target.value }))} /></div>
              <div><Label className="text-xs">Systolic BP</Label><Input type="number" value={form.systolic_bp} onChange={(e) => setForm((f) => ({ ...f, systolic_bp: e.target.value }))} /></div>
              <div><Label className="text-xs">Diastolic BP</Label><Input type="number" value={form.diastolic_bp} onChange={(e) => setForm((f) => ({ ...f, diastolic_bp: e.target.value }))} /></div>
              <div><Label className="text-xs">Resting HR</Label><Input type="number" value={form.resting_hr} onChange={(e) => setForm((f) => ({ ...f, resting_hr: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save Entry"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Doctor's Reports ──────────────────────────────────────────────────────

function DocumentsTab() {
  const [rows, setRows] = useState<WellnessDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: "", category: "consultation" as WellnessDocCategory, doctor_name: "", facility: "", report_date: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    try { setRows(await getDocuments()); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      await addDocument({
        title: form.title.trim(),
        category: form.category,
        doctor_name: form.doctor_name || null,
        facility: form.facility || null,
        report_date: form.report_date || null,
        notes: form.notes || null,
        file,
      });
      toast.success("Report saved");
      setOpen(false);
      setFile(null);
      setForm({ title: "", category: "consultation", doctor_name: "", facility: "", report_date: "", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const download = async (doc: WellnessDocument) => {
    if (!doc.file_path) return;
    try {
      const url = await getDocumentDownloadUrl(doc.file_path);
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="text-[10px]">{rows.length} report{rows.length === 1 ? "" : "s"}</Badge>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Add Report</Button>
      </div>

      {loading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No reports yet. Add a lab result, consultation note, or scan.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <Card key={d.id} className="group">
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{d.title}</span>
                      <Badge variant="outline" className="text-[10px]">{CATEGORY_LABELS[d.category]}</Badge>
                      {d.report_date && <span className="text-xs text-muted-foreground">{format(parseISO(d.report_date), "MMM d, yyyy")}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {[d.doctor_name, d.facility].filter(Boolean).join(" · ")}
                    </div>
                    {d.notes && <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.file_path && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => download(d)} title="Download"><Download className="h-3.5 w-3.5" /></Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={async () => { await deleteDocument(d.id, d.file_path); load(); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setFile(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add doctor's report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual bloodwork" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as WellnessDocCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Report date</Label><Input type="date" value={form.report_date} onChange={(e) => setForm((f) => ({ ...f, report_date: e.target.value }))} /></div>
              <div><Label className="text-xs">Doctor</Label><Input value={form.doctor_name} onChange={(e) => setForm((f) => ({ ...f, doctor_name: e.target.value }))} /></div>
              <div><Label className="text-xs">Facility</Label><Input value={form.facility} onChange={(e) => setForm((f) => ({ ...f, facility: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Attach file (optional)</Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50"
                onClick={() => document.getElementById("wellness-doc-file")?.click()}
              >
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-sm"><FileText className="h-4 w-4" /> {file.name}</div>
                ) : (
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Upload className="h-4 w-4" /> Drop or browse — PDF, image, etc.</div>
                )}
                <input id="wellness-doc-file" type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </div>
            </div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save Report"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Journal ────────────────────────────────────────────────────────────

function JournalTab() {
  const [rows, setRows] = useState<WellnessJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [mood, setMood] = useState("");
  const [energy, setEnergy] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRows(await getJournalEntries()); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!notes.trim()) return;
    setSaving(true);
    try {
      await addJournalEntry({ notes: notes.trim(), mood: mood || null, energy_level: energy ? Number(energy) : null });
      setNotes(""); setMood(""); setEnergy("");
      toast.success("Journal entry saved");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <Textarea placeholder="How are you feeling? Energy, sleep, progress toward your goals…" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex items-center gap-3">
            <Input placeholder="Mood (optional)" className="w-40" value={mood} onChange={(e) => setMood(e.target.value)} />
            <Select value={energy} onValueChange={setEnergy}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Energy (1-5)" /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={save} disabled={saving || !notes.trim()} className="ml-auto gap-1"><Plus className="h-4 w-4" /> {saving ? "Saving…" : "Add Entry"}</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Your wellness journal is empty. Add your first entry above.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {rows.map((j) => (
            <Card key={j.id} className="group">
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{format(parseISO(j.entry_date), "MMM d, yyyy")}</span>
                    {j.mood && <Badge variant="outline" className="text-[10px]">{j.mood}</Badge>}
                    {j.energy_level && <Badge variant="secondary" className="text-[10px]">Energy {j.energy_level}/5</Badge>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={async () => { await deleteJournalEntry(j.id); load(); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap">{j.notes}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
