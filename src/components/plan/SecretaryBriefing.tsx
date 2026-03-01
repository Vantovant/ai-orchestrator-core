import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sparkles, Copy, Loader2, ChevronDown, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { secretaryService } from "@/services/secretaryService";

interface Props {
  enabled: boolean;
}

export default function SecretaryBriefing({ enabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [briefing, setBriefing] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [autoChecked, setAutoChecked] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    if (!enabled || autoChecked || dismissed) return;
    setAutoChecked(true);
    (async () => {
      try {
        const lastDate = await secretaryService.getLastBriefingDate();
        if (lastDate === today) return; // Already briefed today
        await runBriefing();
      } catch {
        // Silently fail auto-briefing
      }
    })();
  }, [enabled, autoChecked, dismissed, today]);

  const runBriefing = async () => {
    setLoading(true);
    try {
      const result = await secretaryService.runBriefing();
      setBriefing(result);
      await secretaryService.setLastBriefingDate(today);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate briefing");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!briefing) return;
    let text = `📋 Daily Briefing — ${format(new Date(), "EEEE, MMM d yyyy")}\n\n`;
    if (briefing.priorities) text += `🎯 Top Priorities:\n${briefing.priorities}\n\n`;
    if (briefing.meetings) text += `📅 Meetings:\n${briefing.meetings}\n\n`;
    if (briefing.commands3) text += `⚡ 3 Commands:\n${briefing.commands3}\n\n`;
    if (briefing.conflicts) text += `⚠️ Conflicts:\n${briefing.conflicts}\n`;
    navigator.clipboard.writeText(text);
    toast.success("Briefing copied to clipboard");
  };

  if (!enabled || dismissed) return null;

  if (loading) {
    return (
      <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5">
        <CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm font-medium">Preparing your morning briefing...</span>
        </CardContent>
      </Card>
    );
  }

  if (!briefing) return null;

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm">Morning Briefing</h3>
            <Badge variant="secondary" className="text-xs">AI</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={runBriefing}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDismissed(true)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        <Collapsible defaultOpen>
          <CollapsibleContent className="space-y-3 text-sm">
            {briefing.priorities && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">🎯 Top Priorities</span>
                <p className="whitespace-pre-wrap mt-1">{briefing.priorities}</p>
              </div>
            )}
            {briefing.meetings && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">📅 Today's Meetings</span>
                <p className="whitespace-pre-wrap mt-1">{briefing.meetings}</p>
              </div>
            )}
            {briefing.conflicts && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">⚠️ Conflicts & Suggestions</span>
                <p className="whitespace-pre-wrap mt-1">{briefing.conflicts}</p>
              </div>
            )}
            {briefing.commands3 && (
              <div>
                <span className="text-xs font-medium text-muted-foreground">⚡ 3 Commands for Today</span>
                <p className="whitespace-pre-wrap mt-1 font-medium">{briefing.commands3}</p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" className="gap-1" onClick={handleCopy}>
            <Copy className="h-3 w-3" /> Copy to WhatsApp
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
