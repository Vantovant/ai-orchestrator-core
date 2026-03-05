import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { emailService, type EmailMessage, type EmailAccount } from "@/services/emailService";
import { taskService } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { meetingService } from "@/services/meetingService";
import { supabase } from "@/integrations/supabase/client";
import AccountSwitcher from "@/components/email/AccountSwitcher";
import EmailList from "@/components/email/EmailList";
import EmailDetail from "@/components/email/EmailDetail";
import CommandBar from "@/components/email/CommandBar";
import CheatSheet from "@/components/email/CheatSheet";
import KeyCoach from "@/components/email/KeyCoach";
import OnboardingTutorial from "@/components/email/OnboardingTutorial";
import { Inbox, Clock, Eye, HelpCircle, Loader2, RefreshCw, Zap } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TUTORIAL_KEY = "vantoos_email_tutorial_done";

export default function EmailPage() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // Accounts
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [unified, setUnified] = useState(true);

  // Emails
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // View
  const [view, setView] = useState<"inbox" | "snoozed" | "waiting">("inbox");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);

  // Triage mode
  const [triageMode, setTriageMode] = useState(false);
  const [focusMode, setFocusMode] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTimes, setLastSyncTimes] = useState<Record<string, string | null>>({});

  // Modals
  const [cmdBarOpen, setCmdBarOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(() => {
    try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return false; }
  });

  // Add account state
  const [addingAccount, setAddingAccount] = useState(false);

  // Load accounts on mount
  useEffect(() => {
    emailService.fetchAccounts().then(accs => {
      setAccounts(accs);
      // Build last sync times
      const syncTimes: Record<string, string | null> = {};
      accs.forEach(a => { syncTimes[a.id] = (a as any).last_sync_at || null; });
      setLastSyncTimes(syncTimes);

      const urlAccount = searchParams.get("account");
      if (urlAccount && accs.find(a => a.id === urlAccount)) {
        setUnified(false);
        setSelectedAccount(urlAccount);
        searchParams.delete("account");
        setSearchParams(searchParams, { replace: true });
        sonnerToast.success("Gmail connected ✅");
      } else if (accs.length > 0 && !selectedAccount) {
        setSelectedAccount(accs[0].id);
      }
    });
  }, []);

  // Load emails when account/view changes
  const loadEmails = useCallback(async () => {
    setLoading(true);
    const accountId = unified ? "all" : selectedAccount;
    if (!accountId && !unified) { setLoading(false); return; }
    const data = await emailService.fetchEmails(unified ? "all" : accountId, view);
    setEmails(data);
    setLoading(false);
  }, [selectedAccount, unified, view]);

  useEffect(() => { loadEmails(); }, [loadEmails]);

  // Unread counts
  const unreadCounts: Record<string, number> = {};
  accounts.forEach(a => {
    unreadCounts[a.id] = emails.filter(e => e.account_id === a.id && !e.is_read).length;
  });

  // Triage sorting & filtering
  const displayEmails = (() => {
    let list = [...emails];
    // Focus filter: hide low-priority/newsletter/spam/fyi
    if (triageMode && focusMode) {
      list = list.filter(e => !["fyi", "spam"].includes(e.category || ""));
    }
    // Unread-only filter
    if (unreadOnly) {
      list = list.filter(e => !e.is_read);
    }
    // Triage sort: unread first, starred first, newest first
    if (triageMode) {
      list.sort((a, b) => {
        if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
        if (a.is_starred !== b.is_starred) return a.is_starred ? -1 : 1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
    }
    return list;
  })();

  // Selected email
  const openEmail = openEmailId ? displayEmails.find(e => e.id === openEmailId) : undefined;

  // Account labels map
  const accountLabels: Record<string, string> = {};
  const accountEmails: Record<string, string> = {};
  accounts.forEach(a => {
    accountLabels[a.id] = a.label;
    accountEmails[a.id] = a.email_address;
  });

  // ─── Sync handler ──────────────────────────────────────────────
  const handleSync = async (accountId?: string) => {
    setSyncing(true);
    try {
      const accountsToSync = accountId
        ? [accounts.find(a => a.id === accountId)].filter(Boolean)
        : accounts;

      let totalSynced = 0;
      for (const acc of accountsToSync) {
        if (!acc) continue;
        const { data, error } = await supabase.functions.invoke("gmail-sync", {
          body: { account_id: acc.id },
        });
        if (error) {
          console.error(`[sync] Error syncing ${acc.email_address}:`, error);
          continue;
        }
        const count = data?.synced_count ?? data?.count ?? 0;
        totalSynced += count;
        setLastSyncTimes(prev => ({ ...prev, [acc.id]: new Date().toISOString() }));
      }

      sonnerToast.success(`Synced ${totalSynced} emails ✅`);
      await loadEmails();
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // ─── Add Account handler ──────────────────────────────────────
  const handleAddAccount = async () => {
    setAddingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke("gmail-auth-start");
      if (error) throw error;
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        throw new Error("No auth URL returned");
      }
    } catch (e: any) {
      if (e.message?.includes("403") || e.message?.includes("access_denied")) {
        toast({
          title: "Google account blocked",
          description: "Use a Gmail.com test account or ask your Workspace admin to trust the app in Admin Console → Security → API controls.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Failed to connect Gmail", description: e.message, variant: "destructive" });
      }
      setAddingAccount(false);
    }
  };

  // ─── Auto-advance helper ───────────────────────────────────────
  const autoAdvance = useCallback((removedIndex: number) => {
    setOpenEmailId(null);
    // Keep same index (next email slides into position), clamp to bounds
    setSelectedIndex(i => {
      const nextLen = emails.length - 1;
      if (nextLen <= 0) return 0;
      return Math.min(removedIndex, nextLen - 1);
    });
  }, [emails.length]);

  // ─── Keyboard shortcuts ────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setCmdBarOpen(true);
      return;
    }

    if (e.key === "?") { e.preventDefault(); setCheatSheetOpen(true); return; }

    // U = toggle unread-only
    if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      setUnreadOnly(prev => !prev);
      return;
    }

    if (openEmailId) {
      const idx = displayEmails.findIndex(em => em.id === openEmailId);
      if (e.key === "Escape") { e.preventDefault(); setOpenEmailId(null); return; }
      if (e.key === "e" || e.key === "E") { e.preventDefault(); handleArchive(idx); return; }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); handleSnooze(undefined, idx); return; }
      if (e.key === "w" || e.key === "W") { e.preventDefault(); handleWaitingOn(idx); return; }
      if (e.key === "t" || e.key === "T") { e.preventDefault(); handleCreateTask(); return; }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); handleCreateMeeting(); return; }
      if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        const em = displayEmails.find(em => em.id === openEmailId);
        if (em) emailService.toggleStar(em.id, em.is_starred).then(() => loadEmails());
        return;
      }
    } else {
      if (e.key === "j" || e.key === "J") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, displayEmails.length - 1)); return; }
      if (e.key === "k" || e.key === "K") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const email = displayEmails[selectedIndex];
        if (email) { emailService.markRead(email.id); setOpenEmailId(email.id); loadEmails(); }
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        handleArchive(selectedIndex);
        return;
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleSnooze(undefined, selectedIndex);
        return;
      }
      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        handleWaitingOn(selectedIndex);
        return;
      }
      if (e.key === "x" || e.key === "X") {
        e.preventDefault();
        const email = displayEmails[selectedIndex];
        if (email) emailService.toggleStar(email.id, email.is_starred).then(() => loadEmails());
        return;
      }
    }
  }, [openEmailId, emails, selectedIndex]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Reset index on view/account change
  useEffect(() => { setSelectedIndex(0); setOpenEmailId(null); }, [view, selectedAccount, unified]);

  // Auto-select first email in triage mode
  useEffect(() => {
    if (triageMode && emails.length > 0 && !openEmailId) {
      setSelectedIndex(0);
    }
  }, [triageMode, emails.length]);

  // Close tutorial
  const closeTutorial = () => {
    setTutorialOpen(false);
    try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch {}
  };

  // ─── Action handlers with auto-advance ─────────────────────────
  const currentEmailForAction = openEmail || displayEmails[selectedIndex];

  const handleArchive = async (idx?: number) => {
    const targetIdx = idx ?? (openEmail ? displayEmails.findIndex(e => e.id === openEmail.id) : selectedIndex);
    const target = displayEmails[targetIdx];
    if (!target) return;
    await emailService.archive(target.id);
    toast({ title: "Archived" });
    autoAdvance(targetIdx);
    loadEmails();
  };

  const handleSnooze = async (until?: string, idx?: number) => {
    const targetIdx = idx ?? (openEmail ? displayEmails.findIndex(e => e.id === openEmail.id) : selectedIndex);
    const target = displayEmails[targetIdx];
    if (!target) return;
    const d = new Date();
    if (!until) { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); until = d.toISOString(); }
    await emailService.snooze(target.id, until);
    toast({ title: "Snoozed until tomorrow 8 AM" });
    autoAdvance(targetIdx);
    loadEmails();
  };

  const handleWaitingOn = async (idx?: number) => {
    const targetIdx = idx ?? (openEmail ? displayEmails.findIndex(e => e.id === openEmail.id) : selectedIndex);
    const target = displayEmails[targetIdx];
    if (!target) return;
    const d = new Date(); d.setDate(d.getDate() + 3);
    await emailService.setWaitingOn(target.id, d.toISOString().slice(0, 10));
    toast({ title: "Marked as Waiting On" });
    autoAdvance(targetIdx);
    loadEmails();
  };

  const handleCreateTask = async () => {
    if (!currentEmailForAction) return;
    try {
      await taskService.create({
        title: currentEmailForAction.subject,
        description: `From: ${currentEmailForAction.sender}\n\n${currentEmailForAction.snippet}`,
        source: "email",
      });
      toast({ title: "Task created", description: currentEmailForAction.subject });
    } catch (err: any) {
      toast({ title: "Failed to create task", description: err.message, variant: "destructive" });
    }
  };

  const handleCreateMeeting = async () => {
    if (!currentEmailForAction) return;
    try {
      const start = new Date();
      start.setDate(start.getDate() + 1);
      start.setHours(10, 0, 0, 0);
      const end = new Date(start); end.setHours(11);
      await meetingService.create({
        title: currentEmailForAction.subject,
        description: `From: ${currentEmailForAction.sender}\n\n${currentEmailForAction.snippet}`,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      toast({ title: "Meeting created", description: currentEmailForAction.subject });
    } catch (err: any) {
      toast({ title: "Failed to create meeting", description: err.message, variant: "destructive" });
    }
  };

  const handleCreateReminder = async () => {
    if (!currentEmailForAction) return;
    try {
      const time = new Date(); time.setDate(time.getDate() + 1); time.setHours(9, 0, 0, 0);
      await reminderService.create({
        title: `Follow up: ${currentEmailForAction.subject}`,
        description: `From: ${currentEmailForAction.sender}`,
        reminder_time: time.toISOString(),
      });
      toast({ title: "Reminder created" });
    } catch (err: any) {
      toast({ title: "Failed to create reminder", description: err.message, variant: "destructive" });
    }
  };

  // Command bar dispatcher
  const handleCommand = (action: string, payload?: any) => {
    switch (action) {
      case "archive": handleArchive(); break;
      case "snooze": handleSnooze(payload); break;
      case "create_task": handleCreateTask(); break;
      case "create_meeting": handleCreateMeeting(); break;
      case "create_reminder": handleCreateReminder(); break;
      case "waiting_on": handleWaitingOn(); break;
      case "view": setView(payload); break;
    }
  };

  // Last synced label for tooltip
  const lastSyncedLabel = () => {
    if (unified) {
      return accounts.map(a => {
        const t = lastSyncTimes[a.id];
        return `${a.email_address}: ${t ? new Date(t).toLocaleTimeString() : "Never"}`;
      }).join("\n");
    }
    const t = lastSyncTimes[selectedAccount];
    return t ? `Last synced: ${new Date(t).toLocaleTimeString()}` : "Never synced";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Email</h1>
            <p className="text-sm text-muted-foreground">Keyboard-first inbox · Press <kbd className="px-1 py-0.5 rounded bg-muted text-[11px] font-mono">?</kbd> for shortcuts</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Triage Mode toggle */}
            <div className="flex items-center gap-1.5">
              <Switch
                checked={triageMode}
                onCheckedChange={setTriageMode}
                id="triage"
                className="scale-90"
              />
              <label htmlFor="triage" className="text-xs text-muted-foreground cursor-pointer select-none flex items-center gap-1">
                <Zap className="h-3 w-3" /> Triage
              </label>
            </div>

            {/* Focus & Unread filters (visible in triage) */}
            {triageMode && (
              <div className="flex items-center gap-2 border-l border-border/50 pl-2">
                <Button
                  variant={focusMode ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setFocusMode(f => !f)}
                >
                  Focus
                </Button>
                <Button
                  variant={unreadOnly ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setUnreadOnly(u => !u)}
                >
                  Unread
                </Button>
              </div>
            )}

            {/* Sync button */}
            {accounts.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={syncing}
                      onClick={() => handleSync(unified ? undefined : selectedAccount)}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                      {syncing ? "Syncing…" : "Sync"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs whitespace-pre-line max-w-[250px]">
                    {lastSyncedLabel()}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCheatSheetOpen(true)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {accounts.length > 0 && (
          <AccountSwitcher
            accounts={accounts}
            selected={selectedAccount}
            unified={unified}
            onSelect={setSelectedAccount}
            onToggleUnified={setUnified}
            unreadCounts={unreadCounts}
            onAddAccount={handleAddAccount}
            addingAccount={addingAccount}
          />
        )}

        {accounts.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground mb-2">No Gmail accounts connected yet.</p>
            <Button size="sm" onClick={handleAddAccount} disabled={addingAccount} className="gap-1.5">
              <Inbox className="h-3.5 w-3.5" /> Connect Gmail
            </Button>
          </div>
        )}

        {/* View tabs */}
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="inbox" className="text-xs gap-1 h-6 px-3">
              <Inbox className="h-3 w-3" /> Inbox
            </TabsTrigger>
            <TabsTrigger value="snoozed" className="text-xs gap-1 h-6 px-3">
              <Clock className="h-3 w-3" /> Snoozed
            </TabsTrigger>
            <TabsTrigger value="waiting" className="text-xs gap-1 h-6 px-3">
              <Eye className="h-3 w-3" /> Waiting On
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <Card className="flex-1 mx-4 mb-0 overflow-hidden rounded-b-none border-b-0">
        <CardContent className="p-0 h-full overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : openEmail ? (
            <EmailDetail
              email={openEmail}
              onBack={() => setOpenEmailId(null)}
              onArchive={() => handleArchive()}
              onSnooze={() => handleSnooze()}
              onStar={() => { emailService.toggleStar(openEmail.id, openEmail.is_starred).then(() => loadEmails()); }}
              onCreateTask={handleCreateTask}
              onCreateMeeting={handleCreateMeeting}
              onCreateReminder={handleCreateReminder}
            />
          ) : (
            <EmailList
              emails={displayEmails}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onOpen={(id) => { emailService.markRead(id); setOpenEmailId(id); }}
              accountLabels={accountLabels}
              accountEmails={accountEmails}
              showAccountBadge={unified}
              compact={triageMode}
            />
          )}
        </CardContent>
      </Card>

      {/* Key Coach strip */}
      <KeyCoach context={openEmail ? "detail" : "list"} triageMode={triageMode} />

      {/* Modals */}
      <CommandBar
        open={cmdBarOpen}
        onClose={() => setCmdBarOpen(false)}
        hasSelected={!!currentEmailForAction}
        onAction={handleCommand}
      />
      <CheatSheet open={cheatSheetOpen} onClose={() => setCheatSheetOpen(false)} />
      <OnboardingTutorial open={tutorialOpen} onClose={closeTutorial} />
    </div>
  );
}
