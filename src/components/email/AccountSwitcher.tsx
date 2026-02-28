import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EmailAccount } from "@/services/emailService";
import { Mail, Plus } from "lucide-react";

const LABEL_COLORS: Record<string, string> = {
  Gov: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Business: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  NM: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  Personal: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

interface Props {
  accounts: EmailAccount[];
  selected: string; // account id or "all"
  unified: boolean;
  onSelect: (id: string) => void;
  onToggleUnified: (v: boolean) => void;
  unreadCounts: Record<string, number>;
}

export default function AccountSwitcher({ accounts, selected, unified, onSelect, onToggleUnified, unreadCounts }: Props) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {/* Unified toggle */}
      <div className="flex items-center gap-1.5 mr-2 shrink-0">
        <Switch checked={unified} onCheckedChange={onToggleUnified} id="unified" className="scale-90" />
        <label htmlFor="unified" className="text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap">Unified</label>
      </div>

      {/* Account tabs */}
      {!unified && accounts.map(acc => {
        const count = unreadCounts[acc.id] || 0;
        const isActive = selected === acc.id;
        return (
          <button
            key={acc.id}
            onClick={() => onSelect(acc.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all shrink-0",
              isActive
                ? "border-primary/40 bg-primary/10 text-foreground shadow-sm"
                : "border-border/50 bg-background hover:bg-muted/50 text-muted-foreground"
            )}
          >
            <Mail className="h-3 w-3" />
            <span>{acc.label}</span>
            {count > 0 && (
              <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] leading-none">
                {count}
              </Badge>
            )}
          </button>
        );
      })}

      {unified && (
        <div className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm shrink-0">
          <Mail className="h-3 w-3" />
          All Accounts
          {Object.values(unreadCounts).reduce((a, b) => a + b, 0) > 0 && (
            <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] leading-none">
              {Object.values(unreadCounts).reduce((a, b) => a + b, 0)}
            </Badge>
          )}
        </div>
      )}

      {/* Add account (stub) */}
      <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground shrink-0" disabled>
        <Plus className="h-3 w-3" /> Add Account
      </Button>
    </div>
  );
}
