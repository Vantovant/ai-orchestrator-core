import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { emailActionLogService, type EmailActionLogEntry, type EmailActionType } from "@/services/emailActionLogService";
import { CheckCircle2, DollarSign, TrendingUp, CheckSquare, Bell, CalendarPlus, FileText, Archive, Clock, Star, Eye } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ACTION_CONFIG: Record<EmailActionType, { label: string; icon: typeof CheckCircle2; className: string }> = {
  finance_income: { label: "Income created", icon: TrendingUp, className: "text-emerald-600 dark:text-emerald-400" },
  finance_expense: { label: "Expense created", icon: DollarSign, className: "text-red-600 dark:text-red-400" },
  task: { label: "Task created", icon: CheckSquare, className: "text-green-600 dark:text-green-400" },
  reminder: { label: "Reminder created", icon: Bell, className: "text-amber-600 dark:text-amber-400" },
  meeting: { label: "Meeting created", icon: CalendarPlus, className: "text-blue-600 dark:text-blue-400" },
  notes: { label: "Sent to Notes", icon: FileText, className: "text-violet-600 dark:text-violet-400" },
  archived: { label: "Archived", icon: Archive, className: "text-muted-foreground" },
  snoozed: { label: "Snoozed", icon: Clock, className: "text-violet-600 dark:text-violet-400" },
  starred: { label: "Starred", icon: Star, className: "text-amber-500" },
  waiting_on: { label: "Waiting On", icon: Eye, className: "text-blue-600 dark:text-blue-400" },
};

interface Props {
  emailId: string;
  refreshKey?: number;
}

export default function HandledStamp({ emailId, refreshKey }: Props) {
  const [actions, setActions] = useState<EmailActionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    emailActionLogService.getForEmail(emailId).then(data => {
      setActions(data);
      setLoading(false);
    });
  }, [emailId, refreshKey]);

  if (loading) return null;

  if (actions.length === 0) {
    return (
      <Card className="border-border/50 bg-muted/10 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 opacity-40" />
          <span>Not handled yet</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-muted/10 p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-semibold text-foreground">Handled</span>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
          {actions.length} action{actions.length !== 1 ? "s" : ""}
        </Badge>
      </div>
      <div className="space-y-1">
        {actions.map(action => {
          const config = ACTION_CONFIG[action.action_type as EmailActionType] || ACTION_CONFIG.notes;
          const Icon = config.icon;
          return (
            <div key={action.id} className="flex items-center gap-2 text-[11px]">
              <Icon className={`h-3 w-3 shrink-0 ${config.className}`} />
              <span className="text-foreground">✅ {config.label}</span>
              <span className="text-muted-foreground ml-auto shrink-0">
                {formatDistanceToNow(new Date(action.created_at), { addSuffix: true })}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
