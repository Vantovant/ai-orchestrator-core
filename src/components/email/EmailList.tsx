import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EmailMessage } from "@/services/emailService";
import { Star, Clock, Eye, ArrowRight, CheckCircle2 } from "lucide-react";
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
  handledEmailIds?: Set<string>;
}

export default function EmailList({ emails, selectedIndex, onSelect, onOpen, onStar, accountLabels, accountEmails, showAccountBadge, compact, handledEmailIds }: Props) {
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <Eye className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-base font-medium">All clear!</p>
        <p className="text-sm mt-1">No emails in this view.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/50">
      {emails.map((email, idx) => {
        const isHandled = handledEmailIds?.has(email.id);
        return (
          <button
            key={email.id}
            data-email-index={idx}
            onClick={() => { onSelect(idx); onOpen(email.id); }}
            className={cn(
              "w-full text-left px-4 transition-colors group",
              compact ? "py-3" : "py-4",
              idx === selectedIndex ? "bg-primary/8 border-l-3 border-l-primary" : "border-l-3 border-l-transparent hover:bg-muted/40",
              !email.is_read && "font-medium"
            )}
          >
            {/* Row 1: Star + Sender + time + arrow */}
            <div className="flex items-center gap-2.5 mb-1">
              {/* Star - large touch target */}
              <div
                className="shrink-0 p-1 -m-1"
                onClick={(e) => { e.stopPropagation(); onStar?.(email.id, email.is_starred); }}
                role="button"
                tabIndex={-1}
              >
                <Star className={cn("h-5 w-5 cursor-pointer hover:text-amber-400 transition-colors", email.is_starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
              </div>

              <span className={cn("text-base truncate flex-1 min-w-0", !email.is_read ? "text-foreground font-semibold" : "text-muted-foreground")}>
                {email.sender.split("@")[0].split("<").pop()}
              </span>

              <span className="text-xs text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(email.date), { addSuffix: false })}
              </span>

              <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            </div>

            {/* Row 2: Subject */}
            <div className={cn("text-sm truncate leading-normal pl-8", !email.is_read ? "text-foreground" : "text-muted-foreground")}>
              {email.subject}
            </div>

            {/* Row 3: Snippet (non-compact only) */}
            {!compact && email.snippet && (
              <div className="text-xs text-muted-foreground/70 truncate mt-0.5 leading-normal pl-8">
                {email.snippet}
              </div>
            )}

            {/* Row 4: Badges */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap pl-8">
              {isHandled && (
                <Badge variant="outline" className="text-[11px] h-6 px-2 py-0 gap-1 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shrink-0">
                  <CheckCircle2 className="h-3 w-3" /> ✓
                </Badge>
              )}
              {showAccountBadge && accountEmails?.[email.account_id] && (
                <Badge variant="outline" className="text-[11px] h-6 px-2 py-0 bg-primary/10 text-primary border-primary/20 shrink-0 max-w-[160px] truncate">
                  {accountEmails[email.account_id]}
                </Badge>
              )}
              {email.category && (
                <Badge variant="outline" className="text-[11px] h-6 px-2 py-0">
                  {CATEGORY_LABELS[email.category] || email.category}
                </Badge>
              )}
              {email.urgency && email.urgency !== "low" && (
                <Badge variant="outline" className={cn("text-[11px] h-6 px-2 py-0", URGENCY_COLORS[email.urgency])}>
                  {email.urgency === "immediate" ? "🔴 Now" : email.urgency === "today" ? "🟠 Today" : "📅 Week"}
                </Badge>
              )}
              {email.waiting_on && (
                <Badge variant="outline" className="text-[11px] h-6 px-2 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">
                  <Clock className="h-3 w-3 mr-0.5" /> Waiting
                </Badge>
              )}
              {email.snoozed_until && (
                <Badge variant="outline" className="text-[11px] h-6 px-2 py-0 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
                  <Clock className="h-3 w-3 mr-0.5" /> Snoozed
                </Badge>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
