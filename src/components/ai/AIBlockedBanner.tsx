import { AlertTriangle, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

interface Props {
  message?: string;
}

export default function AIBlockedBanner({ message }: Props) {
  const navigate = useNavigate();

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">AI Key Required</p>
          <p className="text-xs text-muted-foreground mt-1">
            {message || "To guarantee absolute data sovereignty for this private cohort, a personal OpenAI or Gemini key is required. Connect your key in Settings."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 shrink-0"
          onClick={() => navigate("/settings")}
        >
          <Key className="h-3.5 w-3.5" /> Connect Key
        </Button>
      </CardContent>
    </Card>
  );
}
