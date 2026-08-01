import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EmailMessage } from "@/services/emailService";
import type { SuggestedRoute } from "@/services/emailExtractService";
import SmartExtractPanel from "@/components/email/SmartExtractPanel";
import HandledStamp from "@/components/email/HandledStamp";
import { ArrowLeft, Archive, Clock, Reply, Star, CheckSquare, CalendarPlus, Bell, Paperclip, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

interface Props {
  email: EmailMessage;
  selectedAccount?: { last4: string; account_type?: string; account_id?: string } | null;
  financeCreated?: boolean;
  handledRefreshKey?: number;
  onBack: () => void;
  onArchive: () => void;
  onSnooze: () => void;
  onStar: () => void;
  onCreateTask: () => void;
  onCreateMeeting: () => void;
  onCreateReminder: () => void;
  onCreateExpense?: (entities: any, route: SuggestedRoute) => void;
  onCreateIncome?: (entities: any, route: SuggestedRoute) => void;
}

export default function EmailDetail({ email, selectedAccount, financeCreated, handledRefreshKey, onBack, onArchive, onSnooze, onStar, onCreateTask, onCreateMeeting, onCreateReminder, onCreateExpense, onCreateIncome }: Props) {
  const [extractOpen, setExtractOpen] = useState(true);
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="border-b border-border/50 px-3 py-2 space-y-1.5">
        {/* Row 1: Back + quick actions */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-xs shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" /> Back <kbd className="ml-1 text-[10px] px-1 py-0.5 rounded bg-muted hidden sm:inline">Esc</kbd>
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7" onClick={onStar} title="Star">
            <Star className={email.is_starred ? "h-4 w-4 sm:h-3.5 sm:w-3.5 fill-amber-400 text-amber-400" : "h-4 w-4 sm:h-3.5 sm:w-3.5"} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7" onClick={onArchive} title="Archive (E)">
            <Archive className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7" onClick={onSnooze} title="Snooze (S)">
            <Clock className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-7 sm:w-7" disabled title="Reply (R) – Coming soon">
            <Reply className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          </Button>
        </div>
        {/* Row 2: Create actions */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={onCreateTask}>
            <CheckSquare className="h-3 w-3" /> Task <kbd className="text-[10px] px-1 py-0.5 rounded bg-muted hidden sm:inline">T</kbd>
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={onCreateMeeting}>
            <CalendarPlus className="h-3 w-3" /> Meeting <kbd className="text-[10px] px-1 py-0.5 rounded bg-muted hidden sm:inline">M</kbd>
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={onCreateReminder}>
            <Bell className="h-3 w-3" /> Reminder
          </Button>
        </div>
      </div>

      {/* Email content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4 space-y-4">
        <HandledStamp emailId={email.id} refreshKey={handledRefreshKey} />

        {/* Smart Extract (collapsible so the email stays reachable) */}
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs px-2"
            onClick={() => setExtractOpen((v) => !v)}
          >
            {extractOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {extractOpen ? "Hide Smart Extract" : "Show Smart Extract"}
          </Button>
          {extractOpen && (
            <SmartExtractPanel
              emailId={email.id}
              emailSubject={email.subject}
              emailSender={email.sender}
              emailSnippet={email.snippet}
              selectedAccount={selectedAccount}
              financeCreated={financeCreated}
              onCreateExpense={onCreateExpense || (() => {})}
              onCreateIncome={onCreateIncome}
              onCreateTask={onCreateTask}
              onCreateMeeting={onCreateMeeting}
              onCreateReminder={onCreateReminder}
            />
          )}
        </div>


        <h2 className="text-lg font-semibold text-foreground mb-2">{email.subject}</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <span className="font-medium text-foreground">{email.sender}</span>
          <span>→</span>
          <span>{email.recipients.join(", ")}</span>
        </div>
        <div className="text-xs text-muted-foreground mb-4">
          {format(new Date(email.date), "PPpp")}
        </div>

        {/* Badges */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {email.category && <Badge variant="outline" className="text-xs">{email.category.replace("_", " ")}</Badge>}
          {email.urgency && <Badge variant={email.urgency === "immediate" ? "destructive" : "secondary"} className="text-xs">{email.urgency}</Badge>}
          {email.intent && <Badge variant="secondary" className="text-xs">Intent: {email.intent}</Badge>}
          {email.waiting_on && <Badge className="text-xs bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">Waiting On</Badge>}
        </div>

        {/* Snippet (no full body yet) */}
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-sm text-foreground leading-relaxed">
          {email.snippet}
          <p className="mt-4 text-xs text-muted-foreground italic">
            Full email body not loaded – connect Gmail to see full content.
          </p>
        </div>
      </div>
    </div>
  );
}
