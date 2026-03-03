import { useQuery } from "@tanstack/react-query";
import { tenderService, tenderRequirementsService, tenderComplianceService, tenderPricingService, computeBidReadiness } from "@/services/tenderService";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";

interface Props {
  projectId: string;
}

export default function BidReadinessCard({ projectId }: Props) {
  const tender = useQuery({
    queryKey: ["tender", projectId],
    queryFn: () => tenderService.get(projectId),
  });

  const tenderId = tender.data?.id;

  const reqs = useQuery({
    queryKey: ["tender_requirements", tenderId],
    queryFn: () => tenderRequirementsService.list(tenderId!),
    enabled: !!tenderId,
  });

  const compliance = useQuery({
    queryKey: ["tender_compliance", tenderId],
    queryFn: () => tenderComplianceService.list(tenderId!),
    enabled: !!tenderId,
  });

  const pricing = useQuery({
    queryKey: ["tender_pricing", tenderId],
    queryFn: () => tenderPricingService.get(tenderId!),
    enabled: !!tenderId,
  });

  if (!tenderId) return null;

  const score = computeBidReadiness(
    reqs.data || [],
    compliance.data || [],
    pricing.data || null
  );

  const color = score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive";

  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Bid Readiness
          </span>
          <span className={`text-lg font-bold ${color}`}>{score}%</span>
        </div>
        <Progress value={score} className="h-2" />
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px]">Reqs: {(reqs.data || []).filter(r => r.mandatory && r.status === "met").length}/{(reqs.data || []).filter(r => r.mandatory).length}</Badge>
          <Badge variant="outline" className="text-[10px]">Docs: {(compliance.data || []).filter(c => c.status === "uploaded").length}/{(compliance.data || []).filter(c => c.required).length}</Badge>
          <Badge variant="outline" className="text-[10px]">Pricing: {pricing.data?.pricing_csv_url ? "✓" : "✗"}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
