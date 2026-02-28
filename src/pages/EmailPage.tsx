import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { emailService, type EmailMessage } from "@/services/emailService";
import { taskService } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { meetingService } from "@/services/meetingService";
import AccountSwitcher from "@/components/email/AccountSwitcher";
import EmailList from "@/components/email/EmailList";
import EmailDetail from "@/components/email/EmailDetail";
import CommandBar from "@/components/email/CommandBar";
import CheatSheet from "@/components/email/CheatSheet";
import KeyCoach from "@/components/email/KeyCoach";
import OnboardingTutorial from "@/components/email/OnboardingTutorial";
import { Inbox, Clock, Eye, HelpCircle } from "lucide-react";

const TUTORIAL_KEY = "vantoos_email_tutorial_done";

export default function EmailPage() {
  const { toast } = useToast();

  // Accounts
  const accounts = emailService.getAccounts();
  const [selectedAccount, setSelectedAccount] = useState(accounts[0]?.id || "");
  const [unified, setUnified] = useState(false);

  // View
  const [view, setView] = useState<"inbox" | "snoozed" | "waiting">("inbox");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);

  // Modals
  const [cmdBarOpen, setCmdBarOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(() => {
    try { return !localStorage.getItem(TUTORIAL_KEY); } catch { return false; }
  });

  // Force re-render on mutations
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  // Current email list
  const accountId = unified ? "all" : selectedAccount;
  const emails = emailService.getEmails(accountId, view);

  // Unread counts
  const unreadCounts: Record<string, number> = {};
  accounts.forEach(a => {
    unreadCounts[a.id] = emailService.getEmails(a.id, "inbox").filter(e => !e.is_read).length;
  });

  // Selected email
  const openEmail = openEmailId ? emailService.getById(openEmailId) : undefined;

  // Account labels map
  const accountLabels: Record<string, string> = {};
  accounts.forEach(a => { accountLabels[a.id] = a.label; });

  // ─── Keyboard shortcuts ────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't capture when typing in inputs
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    // Ctrl+K / Cmd+K → command bar
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setCmdBarOpen(true);
      return;
    }

    if (e.key === "?") { e.preventDefault(); setCheatSheetOpen(true); return; }

    if (openEmailId) {
      // Detail view shortcuts
      if (e.key === "Escape") { e.preventDefault(); setOpenEmailId(null); return; }
      if (e.key === "e" || e.key === "E") { e.preventDefault(); handleArchive(); return; }
      if (e.key === "s" || e.key === "S") { e.preventDefault(); handleSnooze(); return; }
      if (e.key === "t" || e.key === "T") { e.preventDefault(); handleCreateTask(); return; }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); handleCreateMeeting(); return; }
    } else {
      // List view shortcuts
      if (e.key === "j" || e.key === "J") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, emails.length - 1)); return; }
      if (e.key === "k" || e.key === "K") { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const email = emails[selectedIndex];
        if (email) { emailService.markRead(email.id); setOpenEmailId(email.id); refresh(); }
        return;
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        const email = emails[selectedIndex];
        if (email) { emailService.archive(email.id); toast({ title: "Archived" }); refresh(); }
        return;
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        const email = emails[selectedIndex];
        if (email) {
          const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0);
          emailService.snooze(email.id, d.toISOString());
          toast({ title: "Snoozed until tomorrow 8 AM" });
          refresh();
        }
        return;
      }
    }
  }, [openEmailId, emails, selectedIndex, tick]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Reset index on view/account change
  useEffect(() => { setSelectedIndex(0); setOpenEmailId(null); }, [view, selectedAccount, unified]);

  // Close tutorial
  const closeTutorial = () => {
    setTutorialOpen(false);
    try { localStorage.setItem(TUTORIAL_KEY, "1"); } catch {}
  };

  // ─── Action handlers ───────────────────────────────────────────
  const currentEmailForAction = openEmail || emails[selectedIndex];

  const handleArchive = () => {
    if (!currentEmailForAction) return;
    emailService.archive(currentEmailForAction.id);
    toast({ title: "Archived" });
    setOpenEmailId(null);
    refresh();
  };

  const handleSnooze = (until?: string) => {
    if (!currentEmailForAction) return;
    const d = new Date();
    if (!until) { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); until = d.toISOString(); }
    emailService.snooze(currentEmailForAction.id, until);
    toast({ title: "Snoozed" });
    setOpenEmailId(null);
    refresh();
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

  const handleWaitingOn = () => {
    if (!currentEmailForAction) return;
    const d = new Date(); d.setDate(d.getDate() + 3);
    emailService.setWaitingOn(currentEmailForAction.id, d.toISOString().slice(0, 10));
    toast({ title: "Marked as Waiting On" });
    setOpenEmailId(null);
    refresh();
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
            <Badge variant="secondary" className="text-[10px]">Mock Data</Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCheatSheetOpen(true)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <AccountSwitcher
          accounts={accounts}
          selected={selectedAccount}
          unified={unified}
          onSelect={setSelectedAccount}
          onToggleUnified={setUnified}
          unreadCounts={unreadCounts}
        />

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
          {openEmail ? (
            <EmailDetail
              email={openEmail}
              onBack={() => setOpenEmailId(null)}
              onArchive={handleArchive}
              onSnooze={() => handleSnooze()}
              onStar={() => { emailService.toggleStar(openEmail.id); refresh(); }}
              onCreateTask={handleCreateTask}
              onCreateMeeting={handleCreateMeeting}
              onCreateReminder={handleCreateReminder}
            />
          ) : (
            <EmailList
              emails={emails}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onOpen={(id) => { emailService.markRead(id); setOpenEmailId(id); refresh(); }}
              accountLabels={accountLabels}
              showAccountBadge={unified}
            />
          )}
        </CardContent>
      </Card>

      {/* Key Coach strip */}
      <KeyCoach context={openEmail ? "detail" : "list"} />

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
