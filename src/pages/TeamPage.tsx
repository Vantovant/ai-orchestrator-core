import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Shield, Users, FolderKanban, CheckCircle2, BookOpen, Brain, Zap, Activity,
  Plus, Copy, Trash2, RefreshCw, FileText, Key
} from "lucide-react";
import { toast } from "sonner";

interface Summary {
  totalTesters: number;
  activeTesters: number;
  projectsCreated: number;
  tasksDone: number;
  kbUploads: number;
  kbQueries: number;
  aiSuccessRate: string;
  snapshotHealth: { ok: number; fail: number };
}

interface Tester {
  id: string;
  email: string;
  joinedAt: string;
  lastActive: string | null;
  totalActions: number;
  pagesVisited: number;
  projectsCreated: number;
  tasksCreated: number;
  tasksDone: number;
  kbUploads: number;
  kbQueries: number;
  aiCalls: number;
  aiErrors: number;
  providersUsed: string[];
  hasOwnKey: boolean;
}

interface Invite {
  id: string;
  token: string;
  label: string;
  cohort: string | null;
  is_used: boolean;
  uses_count: number;
  max_uses: number;
  expires_at: string | null;
  created_at: string;
}

export default function TeamPage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [testers, setTesters] = useState<Tester[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [zaziReport, setZaziReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Invite form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteCohort, setInviteCohort] = useState("");
  const [inviteMaxUses, setInviteMaxUses] = useState("1");

  useEffect(() => {
    checkAdmin();
  }, [user]);

  const checkAdmin = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").limit(1);
    const admin = (data ?? []).length > 0;
    setIsAdmin(admin);
    if (admin) fetchStats();
    else setLoading(false);
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-analytics", { body: { action: "stats" } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setSummary(data.summary);
      setTesters(data.testers ?? []);
      setInvites(data.invites ?? []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const createInvite = async () => {
    try {
      const { error } = await supabase.from("invites").insert({
        label: inviteLabel || "Tester",
        cohort: inviteCohort || null,
        max_uses: parseInt(inviteMaxUses) || 1,
        created_by: user!.id,
      });
      if (error) throw error;
      toast.success("Invite created");
      setInviteOpen(false);
      setInviteLabel("");
      setInviteCohort("");
      fetchStats();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const deleteInvite = async (id: string) => {
    await supabase.from("invites").delete().eq("id", id);
    toast.success("Invite deleted");
    fetchStats();
  };

  const copyToken = (token: string, label?: string) => {
    const signupUrl = "https://executive.onlinecourseformlm.com/";
    const message = `🚀 YOU'RE INVITED TO JOIN VANTOOS — BETA ACCESS

Hi there,

You've been personally selected to join the VantoOS Beta Programme — an AI-powered Executive Operating System built for founders, operators, and ambitious teams across South Africa and beyond.

VantoOS brings together project management, task tracking, finance oversight, knowledge base, and AI-powered strategic guidance — all in one intelligent workspace. Think of it as your AI Chief of Staff.

📋 Your Role: ${label || "Beta Tester"} — You're being onboarded to explore, test, and help shape the platform before public launch.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 HOW TO GET STARTED:

1️⃣  Click the link below to open the VantoOS sign-up page:
    🔗 ${signupUrl}

2️⃣  On the sign-up page, click "Need an account? Sign up" at the bottom.

3️⃣  Enter your email address and choose a password (minimum 6 characters).

4️⃣  You'll see an "Invite code" field — paste this code:
    🔑 ${token}

5️⃣  Click the "Verify" button next to the code to confirm it's valid. You should see a green "✓ Valid" badge.

6️⃣  Click "Sign Up" to create your account.

7️⃣  Check your email inbox for a confirmation link — click it to activate your account.

8️⃣  Once confirmed, return to the link above and sign in with your credentials.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ Important Notes:
• This invite code has limited uses — please sign up promptly.
• If you experience any issues, contact the person who sent you this invite.
• Your feedback during the beta phase is invaluable — explore everything!

Welcome aboard, and thank you for being part of the journey! 🙌`;
    navigator.clipboard.writeText(message);
    toast.success("Invite message with code copied to clipboard!");
  };

  const generateReport = async () => {
    setReportLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-analytics", { body: { action: "ai_summary" } });
      if (error) throw error;
      setZaziReport(data.report);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReportLoading(false);
    }
  };

  if (isAdmin === null) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Skeleton className="h-40 w-80" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <Shield className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-lg font-bold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">Admin role required to view the Tester Status Board.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summaryCards = summary ? [
    { label: "Total Testers", value: summary.totalTesters, icon: Users },
    { label: "Active (24h)", value: summary.activeTesters, icon: Activity },
    { label: "Projects Created", value: summary.projectsCreated, icon: FolderKanban },
    { label: "Tasks Done", value: summary.tasksDone, icon: CheckCircle2 },
    { label: "KB Uploads", value: summary.kbUploads, icon: BookOpen },
    { label: "KB Queries", value: summary.kbQueries, icon: Brain },
    { label: "AI Success Rate", value: `${summary.aiSuccessRate}%`, icon: Zap },
    { label: "Snapshot (24h)", value: `✅${summary.snapshotHealth.ok} ❌${summary.snapshotHealth.fail}`, icon: Activity },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Tester Status Board</h1>
          <p className="text-sm text-muted-foreground">Admin overview of testers, activity, and system health.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading} className="gap-1">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {loading ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">{[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Invite Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Invite Codes</CardTitle>
            <CardDescription>Manage tester access tokens</CardDescription>
          </div>
          <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> New Invite</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Invite</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={e => { e.preventDefault(); createInvite(); }}>
                <Input placeholder="Label (e.g. Beta Wave 1)" value={inviteLabel} onChange={e => setInviteLabel(e.target.value)} />
                <Input placeholder="Cohort tag (optional)" value={inviteCohort} onChange={e => setInviteCohort(e.target.value)} />
                <Input type="number" placeholder="Max uses" value={inviteMaxUses} onChange={e => setInviteMaxUses(e.target.value)} min="1" />
                <Button type="submit" className="w-full">Create</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites created yet.</p>
          ) : (
            <div className="space-y-2">
              {invites.map(inv => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{inv.token}</code>
                    {inv.label && <span className="text-muted-foreground">{inv.label}</span>}
                    {inv.cohort && <Badge variant="secondary" className="text-[10px]">{inv.cohort}</Badge>}
                    <Badge variant={inv.uses_count >= inv.max_uses ? "destructive" : "default"} className="text-[10px]">
                      {inv.uses_count}/{inv.max_uses} used
                    </Badge>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToken(inv.token, inv.label)}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteInvite(inv.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ZAZI Report */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> ZAZI UX Report</CardTitle>
          <Button size="sm" variant="outline" onClick={generateReport} disabled={reportLoading} className="gap-1">
            {reportLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Generate
          </Button>
        </CardHeader>
        {zaziReport && (
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm font-mono bg-muted/50 p-4 rounded-lg overflow-auto max-h-96">
              {zaziReport}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Tester Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Testers</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-center">Actions</TableHead>
                <TableHead className="text-center">Projects</TableHead>
                <TableHead className="text-center">Tasks Done</TableHead>
                <TableHead className="text-center">AI Calls</TableHead>
                <TableHead className="text-center">Errors</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-center">BYOK</TableHead>
                <TableHead className="text-center">Blocked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {testers.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-xs">{t.email}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.joinedAt?.split("T")[0] ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.lastActive?.split("T")[0] ?? "—"}</TableCell>
                  <TableCell className="text-center text-xs">{t.totalActions}</TableCell>
                  <TableCell className="text-center text-xs">{t.projectsCreated}</TableCell>
                  <TableCell className="text-center text-xs">{t.tasksDone}</TableCell>
                  <TableCell className="text-center text-xs">{t.aiCalls}</TableCell>
                  <TableCell className="text-center text-xs">{t.aiErrors > 0 ? <span className="text-destructive">{t.aiErrors}</span> : "0"}</TableCell>
                  <TableCell className="text-xs">
                    {t.providersUsed.length > 0
                      ? t.providersUsed.filter(p => p !== "lovable").join(", ") || "—"
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    {t.hasOwnKey
                      ? <Badge variant="outline" className="text-[10px] text-success border-success/30"><Key className="h-3 w-3 mr-1" />Connected</Badge>
                      : <Badge variant="outline" className="text-[10px] text-warning border-warning/30">Missing</Badge>
                    }
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {(t as any).blockedCount > 0
                      ? <span className="text-destructive font-medium">{(t as any).blockedCount}</span>
                      : "0"}
                  </TableCell>
                </TableRow>
              ))}
              {testers.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">No testers yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
