import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EmailMessage } from "@/services/emailService";
import type { SuggestedRoute } from "@/services/emailExtractService";
import SmartExtractPanel from "@/components/email/SmartExtractPanel";
import { ArrowLeft, Archive, Clock, Reply, Star, CheckSquare, CalendarPlus, Bell, Paperclip } from "lucide-react";
import { format } from "date-fns";

interface Props {
  email: EmailMessage;
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

export default function EmailDetail({ email, onBack, onArchive, onSnooze, onStar, onCreateTask, onCreateMeeting, onCreateReminder, onCreateExpense, onCreateIncome }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" /> Back <kbd className="ml-1 text-[10px] px-1 py-0.5 rounded bg-muted">Esc</kbd>
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStar} title="Star">
          <Star className={email.is_starred ? "h-3.5 w-3.5 fill-amber-400 text-amber-400" : "h-3.5 w-3.5"} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onArchive} title="Archive (E)">
          <Archive className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSnooze} title="Snooze (S)">
          <Clock className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled title="Reply (R) – Coming soon">
          <Reply className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onCreateTask}>
          <CheckSquare className="h-3 w-3" /> Task <kbd className="text-[10px] px-1 py-0.5 rounded bg-muted">T</kbd>
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onCreateMeeting}>
          <CalendarPlus className="h-3 w-3" /> Meeting <kbd className="text-[10px] px-1 py-0.5 rounded bg-muted">M</kbd>
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={onCreateReminder}>
          <Bell className="h-3 w-3" /> Reminder
        </Button>
      </div>

      {/* Email content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Smart Extract Panel */}
        <SmartExtractPanel
          emailId={email.id}
          emailSubject={email.subject}
          emailSender={email.sender}
          emailSnippet={email.snippet}
          onCreateExpense={onCreateExpense || (() => {})}
          onCreateIncome={onCreateIncome}
          onCreateTask={onCreateTask}
          onCreateMeeting={onCreateMeeting}
          onCreateReminder={onCreateReminder}
        />

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
