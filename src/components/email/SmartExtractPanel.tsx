import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { emailExtractService, type EmailExtract, type SuggestedRoute } from "@/services/emailExtractService";
import VerificationBadge from "@/components/ai/VerificationBadge";
import {
  Zap, RefreshCw, DollarSign, CheckSquare, CalendarPlus, Bell, FileText, AlertTriangle,
  CreditCard, Receipt, Plane, MessageSquare, Info, ShoppingBag, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, HelpCircle, TrendingUp,
  Database, ShieldAlert,
} from "lucide-react";

const TYPE_ICONS: Record<string, typeof DollarSign> = {
  expense: CreditCard,
  invoice: Receipt,
  subscription: DollarSign,
  travel: Plane,
  task: CheckSquare,
  meeting: CalendarPlus,
  fyi: Info,
  other: MessageSquare,
};

const TYPE_COLORS: Record<string, string> = {
  expense: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  invoice: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  subscription: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  travel: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  task: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  meeting: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  fyi: "bg-muted text-muted-foreground border-border/50",
  other: "bg-muted text-muted-foreground border-border/50",
};

// Direction badge config — strong visual signals
const DIRECTION_BADGE: Record<string, { label: string; icon: typeof ArrowDownLeft; className: string }> = {
  in: { label: "IN", icon: ArrowDownLeft, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  out: { label: "OUT", icon: ArrowUpRight, className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" },
  neutral: { label: "TRANSFER", icon: ArrowLeftRight, className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
};

function getRouteLabel(route: SuggestedRoute, moneyDirection: any): { label: string; icon: typeof DollarSign } {
  if (route.target === "finance_income") {
    return { label: "Create Income", icon: TrendingUp };
  }
  if (route.target === "finance_expense") {
    if (moneyDirection?.ui_action === "create_income") {
      return { label: "Create Income", icon: TrendingUp };
    }
    return { label: "Create Expense", icon: DollarSign };
  }
  const defaults: Record<string, { label: string; icon: typeof DollarSign }> = {
    task: { label: "Create Task", icon: CheckSquare },
    meeting: { label: "Create Meeting", icon: CalendarPlus },
    reminder: { label: "Create Reminder", icon: Bell },
    notes: { label: "Send to Notes", icon: FileText },
    project: { label: "Link to Project", icon: ShoppingBag },
  };
  return defaults[route.target] || { label: route.target, icon: FileText };
}

interface Props {
  emailId: string;
  emailSubject: string;
  emailSender: string;
  emailSnippet: string;
  selectedAccount?: { last4: string; account_type?: string; account_id?: string } | null;
  financeCreated?: boolean;
  onCreateExpense: (entities: any, route: SuggestedRoute) => void;
  onCreateIncome?: (entities: any, route: SuggestedRoute) => void;
  onCreateTask: () => void;
  onCreateMeeting: () => void;
  onCreateReminder: () => void;
}

export default function SmartExtractPanel({
  emailId, emailSubject, emailSender, emailSnippet,
  selectedAccount, financeCreated,
  onCreateExpense, onCreateIncome, onCreateTask, onCreateMeeting, onCreateReminder,
}: Props) {
  const [extract, setExtract] = useState<EmailExtract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const [isCached, setIsCached] = useState(false);

  const fetchExtract = async (force = false) => {
    if (force) setRerunning(true);
    else setLoading(true);
    setError(null);

    const result = await emailExtractService.extract(emailId, force, selectedAccount || undefined);

    if (result.error) {
      if (result.error === "AI_BLOCKED") {
        setError(result.message || "AI not available. Add API keys in Settings → AI Keys.");
      } else if (result.error === "AI_PARSE_ERROR") {
        setError(result.message || "AI returned invalid data. Click Re-run to try again.");
      } else {
        setError(result.error);
      }
    } else {
      setExtract(result.extract);
      setIsCached(result.cached);
    }
    setLoading(false);
    setRerunning(false);
  };

  // Re-fetch when account changes (force fresh analysis)
  useEffect(() => {
    fetchExtract();
  }, [emailId]);

  // Force re-run when selected account changes
  useEffect(() => {
    if (selectedAccount?.last4 && extract) {
      // Check if the cached extract used a different account
      const cachedLast4 = (extract as any)?.selected_account_last4;
      if (cachedLast4 && cachedLast4 !== selectedAccount.last4) {
        fetchExtract(true);
      } else if (!cachedLast4 && selectedAccount.last4) {
        fetchExtract(true);
      }
    }
  }, [selectedAccount?.last4]);

  const handleRouteAction = (route: SuggestedRoute) => {
    const moneyDir = (extract?.entities_json as any)?.money_direction;

    // Hard guard: block all finance routes if direction is unknown
    const unknownDir = moneyDir?.transaction_type === "unknown" || moneyDir?.ui_action === "none";
    if (unknownDir && (route.target === "finance_income" || route.target === "finance_expense")) {
      toast.error("Cannot create finance entry — money direction is unknown. Select an account and re-run.");
      return;
    }

    const isIncome = route.target === "finance_income" || moneyDir?.ui_action === "create_income";

    switch (route.target) {
      case "finance_income":
        if (onCreateIncome) onCreateIncome(extract?.entities_json, route);
        else onCreateExpense(extract?.entities_json, { ...route, target: "finance_expense" });
        break;
      case "finance_expense":
        if (isIncome && onCreateIncome) {
          onCreateIncome(extract?.entities_json, route);
        } else {
          onCreateExpense(extract?.entities_json, route);
        }
        break;
      case "task": onCreateTask(); break;
      case "meeting": onCreateMeeting(); break;
      case "reminder": onCreateReminder(); break;
      default: break;
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50 bg-muted/10 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-3.5 w-3.5 text-primary animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground">Analyzing email…</span>
        </div>
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-3 w-1/2 mb-2" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5 p-3">
        <div className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
          <span className="text-destructive">{error}</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => fetchExtract(true)}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!extract) return null;

  const entities = extract.entities_json as any;
  const routes = (extract.suggested_routes_json || []) as SuggestedRoute[];
  const moneyDir = entities?.money_direction;
  const TypeIcon = TYPE_ICONS[extract.detected_type] || MessageSquare;
  const needsVerification = extract.requires_user_confirmation || extract.confidence < 0.75;

  // Direction state
  const dirBadge = moneyDir?.direction ? DIRECTION_BADGE[moneyDir.direction] : null;
  const DirIcon = dirBadge?.icon || HelpCircle;
  const isUnknownDirection = moneyDir?.transaction_type === "unknown" || moneyDir?.ui_action === "none";

  // Filter routes: suppress finance actions if direction is unknown
  const safeRoutes = routes.filter(route => {
    if (isUnknownDirection && (route.target === "finance_income" || route.target === "finance_expense")) {
      return false;
    }
    return true;
  });

  return (
    <Card className="border-border/50 bg-muted/10 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">Smart Extract</span>
          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 py-0 ${TYPE_COLORS[extract.detected_type] || ""}`}>
            <TypeIcon className="h-2.5 w-2.5 mr-0.5" />
            {extract.detected_type}
          </Badge>
          {/* Money direction badge */}
          {dirBadge && (
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 py-0 gap-0.5 ${dirBadge.className}`}>
              <DirIcon className="h-2.5 w-2.5" />
              {dirBadge.label}
            </Badge>
          )}
          {/* Unknown direction warning */}
          {isUnknownDirection && moneyDir && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 py-0 gap-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
              <HelpCircle className="h-2.5 w-2.5" />
              UNKNOWN
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{Math.round(extract.confidence * 100)}%</span>
          {needsVerification && <VerificationBadge grounded={false} />}
          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 py-0 gap-0.5 ${isCached ? "bg-muted text-muted-foreground border-border" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"}`}>
            <Database className="h-2.5 w-2.5" />
            {isCached ? "Cached" : "Fresh"}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => fetchExtract(true)}
          disabled={rerunning}
        >
          <RefreshCw className={`h-2.5 w-2.5 ${rerunning ? "animate-spin" : ""}`} />
          Re-run
        </Button>
      </div>

      {/* Summary */}
      <p className="text-xs text-foreground leading-relaxed">{extract.summary}</p>

      {/* Money direction reason */}
      {moneyDir?.reason && moneyDir.transaction_type !== "unknown" && (
        <p className="text-[10px] text-muted-foreground italic">{moneyDir.reason}</p>
      )}

      {/* Unknown direction explanation */}
      {isUnknownDirection && moneyDir && (
        <div className="flex items-start gap-1.5 p-2 rounded-md bg-amber-500/5 border border-amber-500/20">
          <ShieldAlert className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 dark:text-amber-300">
            Direction unclear — finance actions hidden to protect your ledger. 
            {selectedAccount ? " Try selecting a different account or re-run analysis." : " Select a bank account above for better accuracy."}
          </p>
        </div>
      )}

      {/* Extracted entities */}
      {(entities?.merchant || entities?.amount != null || moneyDir?.counterparty) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          {(entities?.merchant || moneyDir?.counterparty) && (
            <>
              <span className="text-muted-foreground">{moneyDir?.direction === "in" ? "From" : "Merchant"}</span>
              <span className="font-medium text-foreground">{entities?.merchant || moneyDir?.counterparty}</span>
            </>
          )}
          {(entities?.amount != null || moneyDir?.amount != null) && (
            <>
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium text-foreground">
                {(entities?.currency || moneyDir?.currency || "ZAR")} {Number(entities?.amount ?? moneyDir?.amount ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
              </span>
            </>
          )}
          {moneyDir?.category && (
            <>
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium text-foreground">{moneyDir.category}</span>
            </>
          )}
          {(entities?.reference || moneyDir?.reference) && (
            <>
              <span className="text-muted-foreground">Reference</span>
              <span className="font-medium text-foreground font-mono text-[10px]">{entities?.reference || moneyDir?.reference}</span>
            </>
          )}
          {entities?.account_hint && (
            <>
              <span className="text-muted-foreground">Account</span>
              <span className="font-medium text-foreground">{entities.account_hint}</span>
            </>
          )}
          {entities?.subscription_hint && (
            <>
              <span className="text-muted-foreground">Subscription</span>
              <span className="font-medium text-foreground">{entities.subscription_hint}</span>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      {safeRoutes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {safeRoutes.map((route, i) => {
            const routeInfo = getRouteLabel(route, moneyDir);
            const RouteIcon = routeInfo.icon;
            const isFinanceRoute = route.target === "finance_income" || route.target === "finance_expense";
            const isDisabled = isFinanceRoute && financeCreated;
            return (
              <Button
                key={i}
                variant={isDisabled ? "outline" : (i === 0 ? "default" : "outline")}
                size="sm"
                className="h-7 text-[11px] gap-1"
                disabled={isDisabled}
                onClick={() => handleRouteAction(route)}
              >
                <RouteIcon className="h-3 w-3" />
                {isDisabled ? `✓ ${routeInfo.label.replace("Create", "Created")}` : routeInfo.label}
                {route.category && <span className="text-muted-foreground ml-0.5">({route.category})</span>}
              </Button>
            );
          })}
        </div>
      )}

      {/* No finance actions available message */}
      {isUnknownDirection && routes.some(r => r.target === "finance_income" || r.target === "finance_expense") && (
        <p className="text-[10px] text-muted-foreground">Finance actions hidden — direction must be confirmed first.</p>
      )}
    </Card>
  );
}
