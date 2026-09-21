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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  HeartPulse, Plus, Scale, FileText, BookHeart, Download, Trash2, Upload, TrendingDown,
  Dumbbell, Flame, Footprints, Moon, Droplets, Stethoscope, Pill, ShieldAlert, Syringe,
  Target, Sparkles, Brain, Activity, CheckCircle2, Ban,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { format, parseISO, startOfWeek, isAfter } from "date-fns";
import {
  getMetrics, addMetric, deleteMetric, type WellnessMetric,
  getWorkouts, addWorkout, deleteWorkout, type WellnessWorkout, type WorkoutCategory, type WorkoutIntensity,
  getDocuments, addDocument, deleteDocument, getDocumentDownloadUrl, type WellnessDocument, type WellnessDocCategory,
  getConditions, addCondition, updateConditionStatus, deleteCondition, type WellnessCondition, type ConditionItemType, type ConditionStatus,
  getJournalEntries, addJournalEntry, deleteJournalEntry, type WellnessJournalEntry,
  getGoals, addGoal, updateGoalStatus, deleteGoal, type WellnessGoal, type GoalDomain,
} from "@/services/wellnessService";

const DOC_CATEGORY_LABELS: Record<WellnessDocCategory, string> = {
  lab_results: "Lab Results", consultation: "Consultation", imaging: "Imaging / Scan",
  prescription: "Prescription", other: "Other",
};
const WORKOUT_CATEGORY_LABELS: Record<WorkoutCategory, string> = {
  cardio: "Cardio", strength: "Strength", flexibility: "Flexibility",
  sports: "Sports", mind_body: "Mind-Body", other: "Other",
};
const CONDITION_TYPE_LABELS: Record<ConditionItemType, string> = {
  condition: "Condition", allergy: "Allergy", medication: "Medication", immunization: "Immunization",
};
const CONDITION_TYPE_ICON: Record<ConditionItemType, any> = {
  condition: Stethoscope, allergy: ShieldAlert, medication: Pill, immunization: Syringe,
};
const GOAL_DOMAIN_LABELS: Record<GoalDomain, string> = { body: "Body", mind: "Mind", health: "Health" };

export default function WellnessPage() {
  const [metrics, setMetrics] = useState<WellnessMetric[]>([]);
  const [workouts, setWorkouts] = useState<WellnessWorkout[]>([]);
  const [goals, setGoals] = useState<WellnessGoal[]>([]);

  useEffect(() => {
    getMetrics(14).then(setMetrics).catch(() => {});
    getWorkouts(30).then(setWorkouts).catch(() => {});
    getGoals().then(setGoals).catch(() => {});
  }, []);

  const weekStart = startOfWeek(new Date());
  const workoutsThisWeek = workouts.filter((w) => isAfter(parseISO(w.workout_date), weekStart)).length;
  const activeGoals = goals.filter((g) => g.status === "active").length;
  const latestWeight = metrics.find((m) => m.weight_kg != null)?.weight_kg;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HeartPulse className="h-6 w-6 text-primary" /> Wellness & Health
        </h1>
        <p className="text-sm text-muted-foreground">
          Body, mind, and health — tracked, trended, and goal-driven.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="px-4 py-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Scale className="h-3 w-3" /> Weight</div>
          <div className="text-lg font-semibold">{latestWeight != null ? `${latestWeight} kg` : "—"}</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Dumbbell className="h-3 w-3" /> Workouts (wk)</div>
          <div className="text-lg font-semibold">{workoutsThisWeek}</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" /> Active goals</div>
          <div className="text-lg font-semibold">{activeGoals}</div>
        </Card>
        <Card className="px-4 py-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="h-3 w-3" /> Domains tracked</div>
          <div className="text-lg font-semibold">Body · Mind · Health</div>
        </Card>
      </div>

      <Tabs defaultValue="vitals">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="vitals" className="gap-1"><Scale className="h-3.5 w-3.5" /> Vitals</TabsTrigger>
          <TabsTrigger value="exercise" className="gap-1"><Dumbbell className="h-3.5 w-3.5" /> Exercise</TabsTrigger>
          <TabsTrigger value="documents" className="gap-1"><FileText className="h-3.5 w-3.5" /> Doctor's Reports</TabsTrigger>
          <TabsTrigger value="profile" className="gap-1"><Stethoscope className="h-3.5 w-3.5" /> Health Profile</TabsTrigger>
          <TabsTrigger value="journal" className="gap-1"><BookHeart className="h-3.5 w-3.5" /> Journal</TabsTrigger>
          <TabsTrigger value="goals" className="gap-1"><Target className="h-3.5 w-3.5" /> Goals</TabsTrigger>
        </TabsList>

        <TabsContent value="vitals" className="pt-4"><VitalsTab metrics={metrics} setMetrics={setMetrics} /></TabsContent>
        <TabsContent value="exercise" className="pt-4"><ExerciseTab workouts={workouts} setWorkouts={setWorkouts} /></TabsContent>
        <TabsContent value="documents" className="pt-4"><DocumentsTab /></TabsContent>
        <TabsContent value="profile" className="pt-4"><HealthProfileTab /></TabsContent>
        <TabsContent value="journal" className="pt-4"><JournalTab /></TabsContent>
        <TabsContent value="goals" className="pt-4"><GoalsTab goals={goals} setGoals={setGoals} metrics={metrics} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Vitals ─────────────────────────────────────────────────────────────

function VitalsTab({ metrics, setMetrics }: { metrics: WellnessMetric[]; setMetrics: (m: WellnessMetric[]) => void }) {
  const [rows, setRows] = useState<WellnessMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    recorded_on: new Date().toISOString().slice(0, 10),
    weight_kg: "", waist_cm: "", body_fat_pct: "", systolic_bp: "", diastolic_bp: "",
    resting_hr: "", steps: "", sleep_hours: "", water_ml: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    try { const m = await getMetrics(); setRows(m); setMetrics(m); } catch (e: any) { toast.error(e.message); }
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
        body_fat_pct: form.body_fat_pct ? Number(form.body_fat_pct) : null,
        systolic_bp: form.systolic_bp ? Number(form.systolic_bp) : null,
        diastolic_bp: form.diastolic_bp ? Number(form.diastolic_bp) : null,
        resting_hr: form.resting_hr ? Number(form.resting_hr) : null,
        steps: form.steps ? Number(form.steps) : null,
        sleep_hours: form.sleep_hours ? Number(form.sleep_hours) : null,
        water_ml: form.water_ml ? Number(form.water_ml) : null,
        notes: form.notes || null,
      });
      toast.success("Entry logged");
      setOpen(false);
      setForm({ recorded_on: new Date().toISOString().slice(0, 10), weight_kg: "", waist_cm: "", body_fat_pct: "", systolic_bp: "", diastolic_bp: "", resting_hr: "", steps: "", sleep_hours: "", water_ml: "", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const weightChart = [...rows].filter((r) => r.weight_kg != null).reverse()
    .map((r) => ({ date: format(parseISO(r.recorded_on), "MMM d"), weight: r.weight_kg }));
  const stepsChart = [...rows].filter((r) => r.steps != null).reverse().slice(-14)
    .map((r) => ({ date: format(parseISO(r.recorded_on), "MMM d"), steps: r.steps }));

  const latest = rows[0];
  const earliest = rows[rows.length - 1];
  const trend = latest?.weight_kg != null && earliest?.weight_kg != null ? (latest.weight_kg - earliest.weight_kg) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {latest?.weight_kg != null && <Card className="px-4 py-2"><div className="text-xs text-muted-foreground">Latest weight</div><div className="text-lg font-semibold">{latest.weight_kg} kg</div></Card>}
          {latest?.body_fat_pct != null && <Card className="px-4 py-2"><div className="text-xs text-muted-foreground">Body fat</div><div className="text-lg font-semibold">{latest.body_fat_pct}%</div></Card>}
          {trend != null && (
            <Card className="px-4 py-2">
              <div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3 w-3" /> Change</div>
              <div className={`text-lg font-semibold ${trend <= 0 ? "text-emerald-600" : "text-amber-600"}`}>{trend > 0 ? "+" : ""}{trend.toFixed(1)} kg</div>
            </Card>
          )}
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Log Entry</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {weightChart.length > 1 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Scale className="h-4 w-4" /> Weight trend</CardTitle></CardHeader>
            <CardContent className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis fontSize={10} domain={["dataMin - 2", "dataMax + 2"]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {stepsChart.length > 1 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1"><Footprints className="h-4 w-4" /> Steps (last 14 logged)</CardTitle></CardHeader>
            <CardContent className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stepsChart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis fontSize={10} />
                  <Tooltip />
                  <Bar dataKey="steps" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {loading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No entries yet. Log your first reading — weight, steps, sleep, whatever you're tracking.</CardContent></Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <Card key={r.id} className="group">
              <CardContent className="py-2.5 px-4 flex items-center gap-2 flex-wrap text-sm">
                <div className="w-24 text-muted-foreground text-xs shrink-0">{format(parseISO(r.recorded_on), "MMM d, yyyy")}</div>
                {r.weight_kg != null && <Badge variant="secondary">{r.weight_kg} kg</Badge>}
                {r.body_fat_pct != null && <Badge variant="secondary">{r.body_fat_pct}% BF</Badge>}
                {r.waist_cm != null && <Badge variant="outline">waist {r.waist_cm} cm</Badge>}
                {(r.systolic_bp != null && r.diastolic_bp != null) && <Badge variant="outline">{r.systolic_bp}/{r.diastolic_bp} mmHg</Badge>}
                {r.resting_hr != null && <Badge variant="outline">HR {r.resting_hr}</Badge>}
                {r.steps != null && <Badge variant="outline" className="gap-1"><Footprints className="h-2.5 w-2.5" />{r.steps}</Badge>}
                {r.sleep_hours != null && <Badge variant="outline" className="gap-1"><Moon className="h-2.5 w-2.5" />{r.sleep_hours}h</Badge>}
                {r.water_ml != null && <Badge variant="outline" className="gap-1"><Droplets className="h-2.5 w-2.5" />{r.water_ml}ml</Badge>}
                {r.notes && <span className="text-xs text-muted-foreground truncate flex-1 min-w-[100px]">{r.notes}</span>}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Log vitals</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Date</Label><Input type="date" value={form.recorded_on} onChange={(e) => setForm((f) => ({ ...f, recorded_on: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Weight (kg)</Label><Input type="number" step="0.1" value={form.weight_kg} onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))} /></div>
              <div><Label className="text-xs">Body fat (%)</Label><Input type="number" step="0.1" value={form.body_fat_pct} onChange={(e) => setForm((f) => ({ ...f, body_fat_pct: e.target.value }))} /></div>
              <div><Label className="text-xs">Waist (cm)</Label><Input type="number" step="0.1" value={form.waist_cm} onChange={(e) => setForm((f) => ({ ...f, waist_cm: e.target.value }))} /></div>
              <div><Label className="text-xs">Resting HR</Label><Input type="number" value={form.resting_hr} onChange={(e) => setForm((f) => ({ ...f, resting_hr: e.target.value }))} /></div>
              <div><Label className="text-xs">Systolic BP</Label><Input type="number" value={form.systolic_bp} onChange={(e) => setForm((f) => ({ ...f, systolic_bp: e.target.value }))} /></div>
              <div><Label className="text-xs">Diastolic BP</Label><Input type="number" value={form.diastolic_bp} onChange={(e) => setForm((f) => ({ ...f, diastolic_bp: e.target.value }))} /></div>
              <div><Label className="text-xs">Steps</Label><Input type="number" value={form.steps} onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))} /></div>
              <div><Label className="text-xs">Sleep (hrs)</Label><Input type="number" step="0.1" value={form.sleep_hours} onChange={(e) => setForm((f) => ({ ...f, sleep_hours: e.target.value }))} /></div>
              <div><Label className="text-xs">Water (ml)</Label><Input type="number" value={form.water_ml} onChange={(e) => setForm((f) => ({ ...f, water_ml: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save Entry"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Exercise ───────────────────────────────────────────────────────────

function ExerciseTab({ workouts, setWorkouts }: { workouts: WellnessWorkout[]; setWorkouts: (w: WellnessWorkout[]) => void }) {
  const [rows, setRows] = useState<WellnessWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    workout_date: new Date().toISOString().slice(0, 10),
    activity: "", category: "cardio" as WorkoutCategory, duration_minutes: "", intensity: "moderate" as WorkoutIntensity,
    distance_km: "", calories_burned: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    try { const w = await getWorkouts(); setRows(w); setWorkouts(w); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.activity.trim()) { toast.error("Activity required"); return; }
    setSaving(true);
    try {
      await addWorkout({
        workout_date: form.workout_date,
        activity: form.activity.trim(),
        category: form.category,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
        intensity: form.intensity,
        distance_km: form.distance_km ? Number(form.distance_km) : null,
        calories_burned: form.calories_burned ? Number(form.calories_burned) : null,
        notes: form.notes || null,
      });
      toast.success("Workout logged");
      setOpen(false);
      setForm({ workout_date: new Date().toISOString().slice(0, 10), activity: "", category: "cardio", duration_minutes: "", intensity: "moderate", distance_km: "", calories_burned: "", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const weekStart = startOfWeek(new Date());
  const thisWeek = rows.filter((w) => isAfter(parseISO(w.workout_date), weekStart));
  const totalMinutes = thisWeek.reduce((s, w) => s + (w.duration_minutes ?? 0), 0);
  const totalCalories = thisWeek.reduce((s, w) => s + (w.calories_burned ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <Card className="px-4 py-2"><div className="text-xs text-muted-foreground">This week</div><div className="text-lg font-semibold">{thisWeek.length} workouts</div></Card>
          <Card className="px-4 py-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" /> Minutes</div><div className="text-lg font-semibold">{totalMinutes}</div></Card>
          {totalCalories > 0 && <Card className="px-4 py-2"><div className="text-xs text-muted-foreground flex items-center gap-1"><Flame className="h-3 w-3" /> Calories</div><div className="text-lg font-semibold">{totalCalories}</div></Card>}
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Log Workout</Button>
      </div>

      {loading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No workouts yet. Log your first session — a run, a lift, a yoga class, anything.</CardContent></Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((w) => (
            <Card key={w.id} className="group">
              <CardContent className="py-2.5 px-4 flex items-center gap-2 flex-wrap text-sm">
                <div className="w-24 text-muted-foreground text-xs shrink-0">{format(parseISO(w.workout_date), "MMM d, yyyy")}</div>
                <span className="font-medium">{w.activity}</span>
                <Badge variant="outline" className="text-[10px]">{WORKOUT_CATEGORY_LABELS[w.category]}</Badge>
                {w.intensity && <Badge variant="secondary" className="text-[10px] capitalize">{w.intensity}</Badge>}
                {w.duration_minutes != null && <Badge variant="outline">{w.duration_minutes} min</Badge>}
                {w.distance_km != null && <Badge variant="outline">{w.distance_km} km</Badge>}
                {w.calories_burned != null && <Badge variant="outline" className="gap-1"><Flame className="h-2.5 w-2.5" />{w.calories_burned}</Badge>}
                {w.notes && <span className="text-xs text-muted-foreground truncate flex-1 min-w-[100px]">{w.notes}</span>}
                <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 text-destructive shrink-0"
                  onClick={async () => { await deleteWorkout(w.id); load(); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log a workout</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Activity</Label><Input value={form.activity} onChange={(e) => setForm((f) => ({ ...f, activity: e.target.value }))} placeholder="e.g. Morning run, Leg day, Yoga" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Date</Label><Input type="date" value={form.workout_date} onChange={(e) => setForm((f) => ({ ...f, workout_date: e.target.value }))} /></div>
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as WorkoutCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(WORKOUT_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Intensity</Label>
                <Select value={form.intensity} onValueChange={(v) => setForm((f) => ({ ...f, intensity: v as WorkoutIntensity }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="moderate">Moderate</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Duration (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} /></div>
              <div><Label className="text-xs">Distance (km)</Label><Input type="number" step="0.1" value={form.distance_km} onChange={(e) => setForm((f) => ({ ...f, distance_km: e.target.value }))} /></div>
              <div><Label className="text-xs">Calories</Label><Input type="number" value={form.calories_burned} onChange={(e) => setForm((f) => ({ ...f, calories_burned: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save Workout"}</Button>
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
    title: "", category: "consultation" as WellnessDocCategory, doctor_name: "", facility: "", report_date: "", follow_up_date: "", notes: "",
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
        title: form.title.trim(), category: form.category, doctor_name: form.doctor_name || null,
        facility: form.facility || null, report_date: form.report_date || null,
        follow_up_date: form.follow_up_date || null, notes: form.notes || null, file,
      });
      toast.success("Report saved");
      setOpen(false); setFile(null);
      setForm({ title: "", category: "consultation", doctor_name: "", facility: "", report_date: "", follow_up_date: "", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const download = async (doc: WellnessDocument) => {
    if (!doc.file_path) return;
    try { window.open(await getDocumentDownloadUrl(doc.file_path), "_blank"); } catch (e: any) { toast.error(e.message); }
  };

  const upcoming = rows.filter((d) => d.follow_up_date && isAfter(parseISO(d.follow_up_date), new Date()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Badge variant="secondary" className="text-[10px]">{rows.length} report{rows.length === 1 ? "" : "s"}</Badge>
          {upcoming.length > 0 && <Badge variant="outline" className="text-[10px]">{upcoming.length} upcoming follow-up{upcoming.length === 1 ? "" : "s"}</Badge>}
        </div>
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
                      <Badge variant="outline" className="text-[10px]">{DOC_CATEGORY_LABELS[d.category]}</Badge>
                      {d.report_date && <span className="text-xs text-muted-foreground">{format(parseISO(d.report_date), "MMM d, yyyy")}</span>}
                      {d.follow_up_date && <Badge variant="secondary" className="text-[10px]">Follow-up {format(parseISO(d.follow_up_date), "MMM d")}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{[d.doctor_name, d.facility].filter(Boolean).join(" · ")}</div>
                    {d.notes && <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {d.file_path && <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" onClick={() => download(d)} title="Download"><Download className="h-3.5 w-3.5" /></Button>}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add doctor's report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Annual bloodwork" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as WellnessDocCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(DOC_CATEGORY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Report date</Label><Input type="date" value={form.report_date} onChange={(e) => setForm((f) => ({ ...f, report_date: e.target.value }))} /></div>
              <div><Label className="text-xs">Doctor</Label><Input value={form.doctor_name} onChange={(e) => setForm((f) => ({ ...f, doctor_name: e.target.value }))} /></div>
              <div><Label className="text-xs">Facility</Label><Input value={form.facility} onChange={(e) => setForm((f) => ({ ...f, facility: e.target.value }))} /></div>
              <div><Label className="text-xs">Follow-up date</Label><Input type="date" value={form.follow_up_date} onChange={(e) => setForm((f) => ({ ...f, follow_up_date: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <div>
              <Label className="text-xs">Attach file (optional)</Label>
              <div className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50" onClick={() => document.getElementById("wellness-doc-file")?.click()}>
                {file ? <div className="flex items-center justify-center gap-2 text-sm"><FileText className="h-4 w-4" /> {file.name}</div>
                  : <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Upload className="h-4 w-4" /> Drop or browse — PDF, image, etc.</div>}
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

// ─── Health Profile (conditions / allergies / meds / immunizations) ──────

function HealthProfileTab() {
  const [rows, setRows] = useState<WellnessCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ item_type: "condition" as ConditionItemType, name: "", detail: "", started_on: "", notes: "" });

  const load = async () => {
    setLoading(true);
    try { setRows(await getConditions()); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      await addCondition({ item_type: form.item_type, name: form.name.trim(), detail: form.detail || null, started_on: form.started_on || null, notes: form.notes || null });
      toast.success("Added to health profile");
      setOpen(false);
      setForm({ item_type: "condition", name: "", detail: "", started_on: "", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const grouped = (["condition", "allergy", "medication", "immunization"] as ConditionItemType[])
    .map((type) => ({ type, items: rows.filter((r) => r.item_type === type) }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Your standing health record — conditions, allergies, medications, and immunizations, kept current.</p>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
      </div>

      {loading ? (
        <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No entries yet. Add ongoing conditions, allergies, medications, or immunizations.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {grouped.filter((g) => g.items.length > 0).map(({ type, items }) => {
            const Icon = CONDITION_TYPE_ICON[type];
            return (
              <Card key={type}>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-1.5"><Icon className="h-4 w-4" /> {CONDITION_TYPE_LABELS[type]}s</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {items.map((c) => (
                    <div key={c.id} className="group flex items-start justify-between gap-2 border rounded p-2 text-sm">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{c.name}</span>
                          <Badge variant={c.status === "active" || c.status === "ongoing" ? "default" : "outline"} className="text-[9px]">{c.status}</Badge>
                        </div>
                        {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
                        {c.started_on && <div className="text-[10px] text-muted-foreground">since {format(parseISO(c.started_on), "MMM yyyy")}</div>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                        {c.status !== "resolved" && (
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600" title="Mark resolved"
                            onClick={async () => { await updateConditionStatus(c.id, "resolved"); load(); }}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                          onClick={async () => { await deleteCondition(c.id); load(); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to health profile</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.item_type} onValueChange={(v) => setForm((f) => ({ ...f, item_type: v as ConditionItemType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CONDITION_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Penicillin, Hypertension, Metformin 500mg" /></div>
            <div><Label className="text-xs">Detail</Label><Input value={form.detail} onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} placeholder="Dosage, frequency, or severity" /></div>
            <div><Label className="text-xs">Started</Label><Input type="date" value={form.started_on} onChange={(e) => setForm((f) => ({ ...f, started_on: e.target.value }))} /></div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save"}</Button>
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
  const [stress, setStress] = useState("");
  const [sleepQuality, setSleepQuality] = useState("");
  const [meditation, setMeditation] = useState("");
  const [gratitude, setGratitude] = useState("");
  const [goalFocus, setGoalFocus] = useState("");
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
      await addJournalEntry({
        notes: notes.trim(), mood: mood || null, energy_level: energy ? Number(energy) : null,
        stress_level: stress ? Number(stress) : null, sleep_quality: sleepQuality ? Number(sleepQuality) : null,
        meditation_minutes: meditation ? Number(meditation) : null, gratitude: gratitude || null,
        goal_focus: goalFocus || null,
      });
      setNotes(""); setMood(""); setEnergy(""); setStress(""); setSleepQuality(""); setMeditation(""); setGratitude(""); setGoalFocus("");
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Input placeholder="Mood" value={mood} onChange={(e) => setMood(e.target.value)} />
            <Select value={goalFocus} onValueChange={setGoalFocus}>
              <SelectTrigger><SelectValue placeholder="Focus" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weight_loss">Weight loss</SelectItem>
                <SelectItem value="strength">Strength</SelectItem>
                <SelectItem value="mental_health">Mental health</SelectItem>
                <SelectItem value="general_wellness">General wellness</SelectItem>
                <SelectItem value="recovery">Recovery</SelectItem>
              </SelectContent>
            </Select>
            <Select value={energy} onValueChange={setEnergy}>
              <SelectTrigger><SelectValue placeholder="Energy (1-5)" /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={stress} onValueChange={setStress}>
              <SelectTrigger><SelectValue placeholder="Stress (1-5)" /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={sleepQuality} onValueChange={setSleepQuality}>
              <SelectTrigger><SelectValue placeholder="Sleep quality (1-5)" /></SelectTrigger>
              <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
            </Select>
            <Input type="number" placeholder="Meditation (min)" value={meditation} onChange={(e) => setMeditation(e.target.value)} />
            <Input placeholder="Grateful for…" className="md:col-span-2" value={gratitude} onChange={(e) => setGratitude(e.target.value)} />
          </div>
          <Button onClick={save} disabled={saving || !notes.trim()} className="gap-1 w-full md:w-auto"><Plus className="h-4 w-4" /> {saving ? "Saving…" : "Add Entry"}</Button>
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
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                    <span>{format(parseISO(j.entry_date), "MMM d, yyyy")}</span>
                    {j.mood && <Badge variant="outline" className="text-[10px]">{j.mood}</Badge>}
                    {j.goal_focus && <Badge variant="secondary" className="text-[10px]">{j.goal_focus.replace("_", " ")}</Badge>}
                    {j.energy_level && <Badge variant="outline" className="text-[10px] gap-1"><Brain className="h-2.5 w-2.5" />Energy {j.energy_level}/5</Badge>}
                    {j.stress_level && <Badge variant="outline" className="text-[10px]">Stress {j.stress_level}/5</Badge>}
                    {j.sleep_quality && <Badge variant="outline" className="text-[10px] gap-1"><Moon className="h-2.5 w-2.5" />{j.sleep_quality}/5</Badge>}
                    {j.meditation_minutes != null && <Badge variant="outline" className="text-[10px]">{j.meditation_minutes}m meditation</Badge>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={async () => { await deleteJournalEntry(j.id); load(); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-sm whitespace-pre-wrap">{j.notes}</p>
                {j.gratitude && <p className="text-xs text-muted-foreground mt-1 italic">Grateful for: {j.gratitude}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Goals ──────────────────────────────────────────────────────────────

function GoalsTab({ goals, setGoals, metrics }: { goals: WellnessGoal[]; setGoals: (g: WellnessGoal[]) => void; metrics: WellnessMetric[] }) {
  const [rows, setRows] = useState<WellnessGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "", domain: "body" as GoalDomain, target_metric: "", target_value: "", starting_value: "", target_date: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    try { const g = await getGoals(); setRows(g); setGoals(g); } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      await addGoal({
        title: form.title.trim(), domain: form.domain, target_metric: form.target_metric || null,
        target_value: form.target_value ? Number(form.target_value) : null,
        starting_value: form.starting_value ? Number(form.starting_value) : null,
        target_date: form.target_date || null, notes: form.notes || null,
      });
      toast.success("Goal set");
      setOpen(false);
      setForm({ title: "", domain: "body", target_metric: "", target_value: "", starting_value: "", target_date: "", notes: "" });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const currentWeight = metrics.find((m) => m.weight_kg != null)?.weight_kg;

  const progressFor = (g: WellnessGoal): number | null => {
    if (g.target_value == null || g.starting_value == null) return null;
    let current = currentWeight;
    if (g.target_metric !== "weight_kg" || current == null) return null;
    const total = Math.abs(g.target_value - g.starting_value);
    if (total === 0) return 100;
    const done = Math.abs(current - g.starting_value);
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  };

  const active = rows.filter((g) => g.status === "active");
  const inactive = rows.filter((g) => g.status !== "active");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Set targets across body, mind, and health — the stuff that actually gets tracked gets done.</p>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> New Goal</Button>
      </div>

      {loading ? (
        <div className="space-y-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No goals yet. Set one for your body, your mind, or your health.</CardContent></Card>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            {active.map((g) => {
              const pct = progressFor(g);
              return (
                <Card key={g.id} className="group">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{g.title}</span>
                          <Badge variant="outline" className="text-[10px]">{GOAL_DOMAIN_LABELS[g.domain]}</Badge>
                        </div>
                        {g.target_date && <div className="text-xs text-muted-foreground mt-0.5">by {format(parseISO(g.target_date), "MMM d, yyyy")}</div>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600" title="Mark achieved"
                          onClick={async () => { await updateGoalStatus(g.id, "achieved"); load(); }}>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" title="Abandon"
                          onClick={async () => { await updateGoalStatus(g.id, "abandoned"); load(); }}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                          onClick={async () => { await deleteGoal(g.id); load(); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {pct != null && (
                      <div className="space-y-1">
                        <Progress value={pct} />
                        <div className="text-[10px] text-muted-foreground">{pct}% toward target</div>
                      </div>
                    )}
                    {g.target_value != null && (
                      <div className="text-xs text-muted-foreground">
                        Target: {g.target_value}{g.target_metric === "weight_kg" ? " kg" : ""}
                        {g.starting_value != null && ` (from ${g.starting_value})`}
                      </div>
                    )}
                    {g.notes && <p className="text-xs text-muted-foreground">{g.notes}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {inactive.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <p className="text-xs text-muted-foreground font-medium">Past goals</p>
              {inactive.map((g) => (
                <Card key={g.id} className="opacity-60">
                  <CardContent className="py-2 px-4 flex items-center gap-2 text-sm">
                    <span>{g.title}</span>
                    <Badge variant={g.status === "achieved" ? "default" : "outline"} className="text-[10px]">{g.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set a new goal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Title</Label><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Get to 80kg, Meditate daily, Lower BP" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Domain</Label>
                <Select value={form.domain} onValueChange={(v) => setForm((f) => ({ ...f, domain: v as GoalDomain }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(GOAL_DOMAIN_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Target date</Label><Input type="date" value={form.target_date} onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))} /></div>
              <div>
                <Label className="text-xs">Tracking metric (optional)</Label>
                <Select value={form.target_metric} onValueChange={(v) => setForm((f) => ({ ...f, target_metric: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent><SelectItem value="weight_kg">Weight (kg)</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Starting value</Label><Input type="number" step="0.1" value={form.starting_value} onChange={(e) => setForm((f) => ({ ...f, starting_value: e.target.value }))} /></div>
              <div><Label className="text-xs">Target value</Label><Input type="number" step="0.1" value={form.target_value} onChange={(e) => setForm((f) => ({ ...f, target_value: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Set Goal"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
