import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EmailMessage } from "@/services/emailService";
import { Star, Clock, Eye, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const URGENCY_COLORS: Record<string, string> = {
  immediate: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  today: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  this_week: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  low: "bg-muted text-muted-foreground border-border/50",
};

const CATEGORY_LABELS: Record<string, string> = {
  action_required: "Action",
  decision_needed: "Decision",
  fyi: "FYI",
  delegation: "Delegate",
  follow_up: "Follow Up",
  spam: "Spam",
  personal: "Personal",
};

interface Props {
  emails: EmailMessage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpen: (id: string) => void;
  onStar?: (id: string, currentState: boolean) => void;
  accountLabels: Record<string, string>;
  accountEmails?: Record<string, string>;
  showAccountBadge: boolean;
  compact?: boolean;
}

export default function EmailList({ emails, selectedIndex, onSelect, onOpen, accountLabels, accountEmails, showAccountBadge, compact }: Props) {
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <Eye className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm font-medium">All clear!</p>
        <p className="text-xs mt-1">No emails in this view.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {emails.map((email, idx) => (
        <button
          key={email.id}
          data-email-index={idx}
          onClick={() => { onSelect(idx); onOpen(email.id); }}
          className={cn(
            "w-full text-left px-4 transition-colors flex gap-3 group",
            compact ? "py-2" : "py-3",
            idx === selectedIndex ? "bg-primary/8 border-l-2 border-l-primary" : "border-l-2 border-l-transparent hover:bg-muted/40",
            !email.is_read && "font-medium"
          )}
        >
          {/* Star */}
          <div className="pt-0.5 shrink-0">
            <Star className={cn("h-3.5 w-3.5", email.is_starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={cn("text-sm truncate", !email.is_read ? "text-foreground" : "text-muted-foreground")}>
                {email.sender.split("@")[0].split("<").pop()}
              </span>
              {/* Account badge: show email address in unified mode */}
              {showAccountBadge && accountEmails?.[email.account_id] && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0 max-w-[180px] truncate">
                  {accountEmails[email.account_id]}
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(email.date), { addSuffix: false })}
              </span>
            </div>

            <div className={cn("text-sm truncate", !email.is_read ? "text-foreground" : "text-muted-foreground")}>
              {email.subject}
            </div>

            {!compact && (
              <div className="text-xs text-muted-foreground/70 truncate mt-0.5">
                {email.snippet}
              </div>
            )}

            {/* Badges row */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {email.category && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0">
                  {CATEGORY_LABELS[email.category] || email.category}
                </Badge>
              )}
              {email.urgency && email.urgency !== "low" && (
                <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5 py-0", URGENCY_COLORS[email.urgency])}>
                  {email.urgency === "immediate" ? "🔴 Now" : email.urgency === "today" ? "🟠 Today" : "📅 This week"}
                </Badge>
              )}
              {email.waiting_on && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                  <Clock className="h-2.5 w-2.5 mr-0.5" /> Waiting
                </Badge>
              )}
              {email.snoozed_until && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
                  <Clock className="h-2.5 w-2.5 mr-0.5" /> Snoozed
                </Badge>
              )}
            </div>
          </div>

          {/* Open arrow */}
          <div className="pt-1 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity">
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  );
}
