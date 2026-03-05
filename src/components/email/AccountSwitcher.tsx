import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { EmailAccount } from "@/services/emailService";
import { Mail, Plus, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  accounts: EmailAccount[];
  selected: string; // account id or "all"
  unified: boolean;
  onSelect: (id: string) => void;
  onToggleUnified: (v: boolean) => void;
  unreadCounts: Record<string, number>;
  onAddAccount?: () => void;
  addingAccount?: boolean;
}

export default function AccountSwitcher({
  accounts,
  selected,
  unified,
  onSelect,
  onToggleUnified,
  unreadCounts,
  onAddAccount,
  addingAccount,
}: Props) {
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  const selectedAccount = accounts.find((a) => a.id === selected);
  const currentLabel = unified
    ? "All Accounts"
    : selectedAccount?.email_address ?? selectedAccount?.label ?? "Select account";

  return (
    <div className="space-y-1.5">
      {/* Current account indicator */}
      <p className="text-xs text-muted-foreground px-0.5">
        Showing:{" "}
        <span className="font-medium text-foreground">{currentLabel}</span>
      </p>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {/* Unified toggle */}
        <div className="flex items-center gap-1.5 mr-1 sm:mr-2 shrink-0">
          <Switch
            checked={unified}
            onCheckedChange={onToggleUnified}
            id="unified"
            className="scale-90"
          />
          <label
            htmlFor="unified"
            className="text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap"
          >
            Unified
          </label>
        </div>

        {/* Account selector dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all shrink-0 min-h-[32px]",
                "border-primary/40 bg-primary/10 text-foreground shadow-sm"
              )}
            >
              <Mail className="h-3 w-3" />
              <span>{unified ? "All Accounts" : selectedAccount?.label || selectedAccount?.email_address || "Account"}</span>
              {unified && totalUnread > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] leading-none">
                  {totalUnread}
                </Badge>
              )}
              {!unified && selected && unreadCounts[selected] > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] leading-none">
                  {unreadCounts[selected]}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            <DropdownMenuItem
              onClick={() => {
                onToggleUnified(true);
                onSelect("all");
              }}
              className="gap-2 text-xs"
            >
              <Mail className="h-3.5 w-3.5" />
              <span className="flex-1">All Accounts</span>
              {totalUnread > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] leading-none">
                  {totalUnread}
                </Badge>
              )}
            </DropdownMenuItem>
            {accounts.map((acc) => {
              const count = unreadCounts[acc.id] || 0;
              return (
                <DropdownMenuItem
                  key={acc.id}
                  onClick={() => {
                    onToggleUnified(false);
                    onSelect(acc.id);
                  }}
                  className="gap-2 text-xs"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{acc.email_address}</p>
                    {acc.label && (
                      <p className="text-[10px] text-muted-foreground">{acc.label}</p>
                    )}
                  </div>
                  {count > 0 && (
                    <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] leading-none">
                      {count}
                    </Badge>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Add account */}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 sm:h-7 gap-1 text-xs text-muted-foreground shrink-0"
          onClick={onAddAccount}
          disabled={addingAccount || !onAddAccount}
        >
          <Plus className="h-3.5 w-3.5 sm:h-3 sm:w-3" /> <span className="hidden sm:inline">Add Account</span><span className="sm:hidden">Add</span>
        </Button>
      </div>
    </div>
  );
}
