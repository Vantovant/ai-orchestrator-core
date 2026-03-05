import { AlertTriangle, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

interface Props {
  message?: string;
  assistedRemaining?: number;
}

export default function AIBlockedBanner({ message, assistedRemaining }: Props) {
  const navigate = useNavigate();

  const defaultMessage = "To guarantee data sovereignty, connect your personal OpenAI or Gemini key in Settings → AI Keys.";

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">AI Key Required</p>
          <p className="text-xs text-muted-foreground mt-1">
            {message || defaultMessage}
          </p>
          {assistedRemaining !== undefined && assistedRemaining === 0 && (
            <p className="text-xs text-destructive mt-2 font-medium">
              Assisted mode is now finished. Add your API key in Settings → AI Keys to continue using Smart Capture & Assistant.
            </p>
          )}
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">How to add your key:</p>
            <ol className="text-xs text-muted-foreground list-decimal ml-4 space-y-1">
              <li>Go to Settings → AI Keys</li>
              <li>Toggle "Use my own API keys" ON</li>
              <li>Paste your OpenAI key (<code className="text-[10px] bg-muted px-1 rounded">sk-...</code>) or Gemini key (<code className="text-[10px] bg-muted px-1 rounded">AI...</code>)</li>
              <li>Click Test to verify, then Save</li>
            </ol>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 shrink-0"
          onClick={() => navigate("/settings")}
        >
          <Key className="h-3.5 w-3.5" /> Settings → AI Keys
        </Button>
      </CardContent>
    </Card>
  );
}
