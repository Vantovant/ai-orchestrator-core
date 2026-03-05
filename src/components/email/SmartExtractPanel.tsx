import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { emailExtractService, type EmailExtract, type SuggestedRoute } from "@/services/emailExtractService";
import VerificationBadge from "@/components/ai/VerificationBadge";
import {
  Zap, RefreshCw, DollarSign, CheckSquare, CalendarPlus, Bell, FileText, AlertTriangle,
  CreditCard, Receipt, Plane, MessageSquare, Info, ShoppingBag
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

const ROUTE_LABELS: Record<string, { label: string; icon: typeof DollarSign }> = {
  finance_expense: { label: "Create Expense", icon: DollarSign },
  task: { label: "Create Task", icon: CheckSquare },
  meeting: { label: "Create Meeting", icon: CalendarPlus },
  reminder: { label: "Create Reminder", icon: Bell },
  notes: { label: "Send to Notes", icon: FileText },
  project: { label: "Link to Project", icon: ShoppingBag },
};

interface Props {
  emailId: string;
  emailSubject: string;
  emailSender: string;
  emailSnippet: string;
  onCreateExpense: (entities: any, route: SuggestedRoute) => void;
  onCreateTask: () => void;
  onCreateMeeting: () => void;
  onCreateReminder: () => void;
}

export default function SmartExtractPanel({
  emailId,
  emailSubject,
  emailSender,
  emailSnippet,
  onCreateExpense,
  onCreateTask,
  onCreateMeeting,
  onCreateReminder,
}: Props) {
  const [extract, setExtract] = useState<EmailExtract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const fetchExtract = async (force = false) => {
    if (force) setRerunning(true);
    else setLoading(true);
    setError(null);

    const result = await emailExtractService.extract(emailId, force);

    if (result.error) {
      if (result.error === "AI_BLOCKED") {
        setError(result.message || "AI not available. Add API keys in Settings → AI Keys.");
      } else {
        setError(result.error);
      }
    } else {
      setExtract(result.extract);
    }
    setLoading(false);
    setRerunning(false);
  };

  useEffect(() => {
    fetchExtract();
  }, [emailId]);

  const handleRouteAction = (route: SuggestedRoute) => {
    switch (route.target) {
      case "finance_expense":
        onCreateExpense(extract?.entities_json, route);
        break;
      case "task":
        onCreateTask();
        break;
      case "meeting":
        onCreateMeeting();
        break;
      case "reminder":
        onCreateReminder();
        break;
      default:
        break;
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
      <Card className="border-border/50 bg-muted/10 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] ml-auto" onClick={() => fetchExtract(true)}>
            Retry
          </Button>
        </div>
      </Card>
    );
  }

  if (!extract) return null;

  const entities = extract.entities_json;
  const routes = extract.suggested_routes_json || [];
  const TypeIcon = TYPE_ICONS[extract.detected_type] || MessageSquare;
  const needsVerification = extract.requires_user_confirmation || extract.confidence < 0.75;

  return (
    <Card className="border-border/50 bg-muted/10 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-semibold">Smart Extract</span>
          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 py-0 ${TYPE_COLORS[extract.detected_type] || ""}`}>
            <TypeIcon className="h-2.5 w-2.5 mr-0.5" />
            {extract.detected_type}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{Math.round(extract.confidence * 100)}%</span>
          {needsVerification && <VerificationBadge />}
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

      {/* Extracted entities */}
      {(entities.merchant || entities.amount != null) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          {entities.merchant && (
            <>
              <span className="text-muted-foreground">Merchant</span>
              <span className="font-medium text-foreground">{entities.merchant}</span>
            </>
          )}
          {entities.amount != null && (
            <>
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium text-foreground">
                {entities.currency || "ZAR"} {Number(entities.amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
              </span>
            </>
          )}
          {entities.transaction_type && (
            <>
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium text-foreground capitalize">{entities.transaction_type}</span>
            </>
          )}
          {entities.category_suggestion && (
            <>
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium text-foreground">{entities.category_suggestion}</span>
            </>
          )}
          {entities.reference && (
            <>
              <span className="text-muted-foreground">Reference</span>
              <span className="font-medium text-foreground font-mono text-[10px]">{entities.reference}</span>
            </>
          )}
          {entities.account_hint && (
            <>
              <span className="text-muted-foreground">Account</span>
              <span className="font-medium text-foreground">{entities.account_hint}</span>
            </>
          )}
          {entities.subscription_hint && (
            <>
              <span className="text-muted-foreground">Subscription</span>
              <span className="font-medium text-foreground">{entities.subscription_hint}</span>
            </>
          )}
        </div>
      )}

      {/* Action buttons */}
      {routes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {routes.map((route, i) => {
            const routeInfo = ROUTE_LABELS[route.target];
            if (!routeInfo) return null;
            const RouteIcon = routeInfo.icon;
            return (
              <Button
                key={i}
                variant={i === 0 ? "default" : "outline"}
                size="sm"
                className="h-7 text-[11px] gap-1"
                onClick={() => handleRouteAction(route)}
              >
                <RouteIcon className="h-3 w-3" />
                {routeInfo.label}
                {route.category && <span className="text-muted-foreground ml-0.5">({route.category})</span>}
              </Button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
