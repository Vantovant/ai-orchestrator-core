import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { contextService } from "@/services/contextService";
import { financeEntryService, debtService } from "@/services/financeService";
import { clientService } from "@/services/clientService";
import { secretaryService, type SecretarySettings } from "@/services/secretaryService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Settings, Pencil, Download, User, Keyboard, Users, Tag, Bot, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ProfileWizard from "@/components/settings/ProfileWizard";

const CONTEXT_CHAR_LIMIT = 500;

const SUGGESTED_KEYS = [
  { key: "role", label: "Your Role", placeholder: "e.g. CEO, VP Engineering" },
  { key: "goal", label: "Current Goal", placeholder: "e.g. Launch product by Q2" },
  { key: "focus", label: "Weekly Focus", placeholder: "e.g. Hiring, fundraising" },
  { key: "priorities", label: "Business Priorities", placeholder: "e.g. Revenue growth, team expansion" },
  { key: "preferences", label: "AI Preferences", placeholder: "e.g. Be concise, focus on actionable items" },
];

function SecretarySettingsCard() {
  const [settings, setSettings] = useState<SecretarySettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    secretaryService.getSettings().then(s => { setSettings(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const toggle = async (key: keyof SecretarySettings, val: boolean) => {
    if (!settings) return;
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    try {
      await secretaryService.saveSettings(updated);
      toast.success("Secretary setting saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  if (loading) return <Card><CardContent className="p-4"><Skeleton className="h-20" /></CardContent></Card>;
  if (!settings) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" /> Secretary Mode</CardTitle>
        <CardDescription>Configure your AI executive secretary preferences.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Secretary Mode</p>
            <p className="text-xs text-muted-foreground">Enable AI-powered executive assistance</p>
          </div>
          <Switch checked={settings.secretary_mode} onCheckedChange={(v) => toggle("secretary_mode", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Morning Briefing</p>
            <p className="text-xs text-muted-foreground">Auto-generate daily briefing on first open</p>
          </div>
          <Switch checked={settings.morning_briefing} onCheckedChange={(v) => toggle("morning_briefing", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Pre-Meeting Prompts</p>
            <p className="text-xs text-muted-foreground">AI preparation packs before meetings</p>
          </div>
          <Switch checked={settings.pre_meeting_prompts} onCheckedChange={(v) => toggle("pre_meeting_prompts", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">End-of-Day Review</p>
            <p className="text-xs text-muted-foreground">AI summary when opening notes</p>
          </div>
          <Switch checked={settings.end_of_day_review} onCheckedChange={(v) => toggle("end_of_day_review", v)} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const contexts = useQuery({ queryKey: ["executive_context"], queryFn: contextService.list });
  const clients = useQuery({ queryKey: ["clients"], queryFn: clientService.list });

  const [open, setOpen] = useState(false);
  const [editKey, setEditKey] = useState("");
  const [editValue, setEditValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Client management
  const [clientOpen, setClientOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientType, setClientType] = useState("client");

  const [showKeyCoach, setShowKeyCoach] = useState(() => localStorage.getItem("vanto_key_coach") !== "false");

  // AI Preference
  const aiPrefQuery = useQuery({
    queryKey: ["ai_preference"],
    queryFn: async () => {
      const { data } = await supabase.from("user_preferences").select("preference_value").eq("preference_key", "ai_preference").eq("user_id", user?.id ?? "").maybeSingle();
      return (data?.preference_value as any)?.order ?? "fastest";
    },
    enabled: !!user,
  });
  const aiPrefMut = useMutation({
    mutationFn: async (order: string) => {
      const { data: existing } = await supabase.from("user_preferences").select("id").eq("preference_key", "ai_preference").eq("user_id", user!.id).maybeSingle();
      if (existing) {
        await supabase.from("user_preferences").update({ preference_value: { order } }).eq("id", existing.id);
      } else {
        await supabase.from("user_preferences").insert({ user_id: user!.id, preference_key: "ai_preference", preference_value: { order } });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai_preference"] }); toast.success("AI preference saved"); },
  });

  const upsertMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => contextService.upsert(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["executive_context"] });
      setOpen(false); setEditKey(""); setEditValue(""); setIsEditing(false);
      toast.success("Context saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("executive_context").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["executive_context"] }); toast.success("Context removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  const createClientMut = useMutation({
    mutationFn: () => clientService.create({ name: clientName, type: clientType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setClientOpen(false); setClientName(""); toast.success("Client/Matter added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteClientMut = useMutation({
    mutationFn: (id: string) => clientService.softDelete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); toast.success("Removed"); },
  });

  const openEdit = (key: string, value: string) => { setEditKey(key); setEditValue(value); setIsEditing(true); setOpen(true); };
  const openNew = (suggestedKey?: string) => { setEditKey(suggestedKey ?? ""); setEditValue(""); setIsEditing(false); setOpen(true); };

  const existingKeys = new Set((contexts.data ?? []).map((c) => c.context_key));
  const missingSuggestions = SUGGESTED_KEYS.filter((s) => !existingKeys.has(s.key));
  const charsRemaining = CONTEXT_CHAR_LIMIT - editValue.length;

  const handleExportEntries = async () => {
    try {
      const csv = await financeEntryService.exportCsv();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "finance-entries.csv"; a.click();
      toast.success("Entries exported");
    } catch { toast.error("Export failed"); }
  };

  const handleExportDebts = async () => {
    try {
      const csv = await debtService.exportCsv();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "debts.csv"; a.click();
      toast.success("Debts exported");
    } catch { toast.error("Export failed"); }
  };

  const toggleKeyCoach = (val: boolean) => {
    localStorage.setItem("vanto_key_coach", val.toString());
    setShowKeyCoach(val);
    toast.success(val ? "Key Coach enabled" : "Key Coach hidden");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile, preferences, clients, and data exports.</p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" /> Account</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm"><span className="text-muted-foreground">Email:</span> {user?.email}</p>
        </CardContent>
      </Card>

      {/* Executive Profile Wizard */}
      <ProfileWizard />

      {/* Clients/Matters Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Clients & Matters</CardTitle>
          <Dialog open={clientOpen} onOpenChange={setClientOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Client / Matter</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createClientMut.mutate(); }}>
                <Input placeholder="Name" value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                <select
                  value={clientType}
                  onChange={(e) => setClientType(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="client">Client</option>
                  <option value="matter">Matter</option>
                  <option value="project">Project</option>
                </select>
                <Button type="submit" className="w-full" disabled={createClientMut.isPending}>
                  {createClientMut.isPending ? "Adding..." : "Add"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {clients.isLoading ? (
            <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (clients.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No clients yet. Add clients or matters to tag tasks, meetings, and finance entries.</p>
          ) : (
            <div className="space-y-2">
              {(clients.data ?? []).map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">({c.type})</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteClientMut.mutate(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Keyboard className="h-4 w-4" /> Email Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Show Key Coach</p>
              <p className="text-xs text-muted-foreground">Contextual keyboard shortcut strip in Email module</p>
            </div>
            <Switch checked={showKeyCoach} onCheckedChange={toggleKeyCoach} />
          </div>
        </CardContent>
      </Card>

      {/* AI Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> AI Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Provider Fallback Order</p>
              <p className="text-xs text-muted-foreground">Choose how AI providers are prioritized when the primary is unavailable</p>
            </div>
            <Select value={aiPrefQuery.data ?? "fastest"} onValueChange={(v) => aiPrefMut.mutate(v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fastest">Prefer fastest</SelectItem>
                <SelectItem value="quality">Prefer quality</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Secretary Mode Settings */}
      <SecretarySettingsCard />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><Settings className="h-4 w-4" /> Executive Context</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1" onClick={() => openNew()}><Plus className="h-4 w-4" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{isEditing ? "Edit Context" : "Add Context"}</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={e => {
                e.preventDefault();
                if (editValue.length > CONTEXT_CHAR_LIMIT) { toast.error(`Max ${CONTEXT_CHAR_LIMIT} chars`); return; }
                upsertMut.mutate({ key: editKey, value: editValue });
              }}>
                <Input placeholder="Key (e.g. role, goal)" value={editKey} onChange={e => setEditKey(e.target.value)} required disabled={isEditing} />
                <div>
                  <Textarea placeholder="Value" value={editValue} onChange={e => setEditValue(e.target.value.slice(0, CONTEXT_CHAR_LIMIT))} required rows={4} maxLength={CONTEXT_CHAR_LIMIT} />
                  <p className={`text-xs mt-1 text-right ${charsRemaining < 50 ? "text-destructive" : "text-muted-foreground"}`}>{charsRemaining} remaining</p>
                </div>
                <Button type="submit" className="w-full" disabled={upsertMut.isPending}>{upsertMut.isPending ? "Saving..." : "Save"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {contexts.isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : (contexts.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No context set yet. Add role, goals, and focus for personalized AI briefings.</p>
          ) : (
            <div className="space-y-2">
              {(contexts.data ?? []).map(c => (
                <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.context_key}</p>
                    <p className="mt-0.5 text-sm">{c.context_value}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c.context_key, c.context_value)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {missingSuggestions.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Suggested:</p>
              <div className="flex flex-wrap gap-2">
                {missingSuggestions.map(s => (
                  <Button key={s.key} variant="outline" size="sm" className="text-xs" onClick={() => openNew(s.key)}>+ {s.label}</Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Data Export</CardTitle>
          <CardDescription>Export your data as CSV files.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportEntries}>Finance Entries CSV</Button>
            <Button variant="outline" size="sm" onClick={handleExportDebts}>Debts CSV</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
