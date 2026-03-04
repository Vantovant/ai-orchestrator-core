import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  grounded: boolean;
  className?: string;
}

export default function VerificationBadge({ grounded, className }: Props) {
  if (grounded) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`text-[10px] gap-1 text-success border-success/30 ${className}`}>
              <CheckCircle2 className="h-3 w-3" /> Verified
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">This output is grounded in uploaded documents or verified sources.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`text-[10px] gap-1 text-warning border-warning/30 bg-warning/5 ${className}`}>
            <AlertTriangle className="h-3 w-3" /> Needs verification
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">This AI output is not grounded in uploaded documents. Verify before acting on it.</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
