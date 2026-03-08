import { Check, AlertTriangle, XCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface WriteReceiptData {
  action_type: string;
  status: "success" | "warning" | "error";
  created_count: number;
  merged_count: number;
  failed_count: number;
  affected_ids: string[];
  source_reference?: string;
  timestamp: string;
  summary: string;
}

interface Props {
  receipt: WriteReceiptData;
  onNavigate?: () => void;
  navigateLabel?: string;
}

export function WriteReceiptBanner({ receipt, onNavigate, navigateLabel }: Props) {
  const icon = receipt.status === "error"
    ? <XCircle className="h-4 w-4 text-destructive shrink-0" />
    : receipt.status === "warning"
    ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
    : <Check className="h-4 w-4 text-primary shrink-0" />;

  const bgClass = receipt.status === "error"
    ? "bg-destructive/5 border-destructive/30"
    : receipt.status === "warning"
    ? "bg-amber-500/5 border-amber-500/30"
    : "bg-primary/5 border-primary/30";

  return (
    <div className={`rounded-md border p-3 space-y-2 ${bgClass}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold">{receipt.summary}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {receipt.created_count > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
            <Check className="h-2.5 w-2.5" /> {receipt.created_count} created
          </Badge>
        )}
        {receipt.merged_count > 0 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {receipt.merged_count} merged
          </Badge>
        )}
        {receipt.failed_count > 0 && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            {receipt.failed_count} failed
          </Badge>
        )}
      </div>
      {onNavigate && (
        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1 w-full" onClick={onNavigate}>
          <ExternalLink className="h-3 w-3" />
          {navigateLabel || "View Results"}
        </Button>
      )}
    </div>
  );
}

export function buildReceipt(
  actionType: string,
  created: number,
  merged: number,
  failed: number,
  ids: string[],
  source?: string,
): WriteReceiptData {
  const total = created + merged;
  const status: WriteReceiptData["status"] = failed > 0 && total === 0 ? "error" : failed > 0 ? "warning" : "success";
  const parts: string[] = [];
  if (created > 0) parts.push(`${created} created`);
  if (merged > 0) parts.push(`${merged} merged`);
  if (failed > 0) parts.push(`${failed} failed`);
  const summary = total > 0
    ? `Receipt ready — ${parts.join(", ")}`
    : `Failed — ${parts.join(", ")}`;

  return {
    action_type: actionType,
    status,
    created_count: created,
    merged_count: merged,
    failed_count: failed,
    affected_ids: ids,
    source_reference: source,
    timestamp: new Date().toISOString(),
    summary,
  };
}
