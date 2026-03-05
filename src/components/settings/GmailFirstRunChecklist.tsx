import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, Circle, Mail, RefreshCw, Inbox, Keyboard, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  hasConnectedAccount: boolean;
  hasSyncedEmails: boolean;
  onSync: () => void;
  syncing: boolean;
}

const DISMISS_KEY = "vantoos_gmail_firstrun_dismissed";

export default function GmailFirstRunChecklist({ open, onClose, hasConnectedAccount, hasSyncedEmails, onSync, syncing }: Props) {
  const navigate = useNavigate();
  const [dontShow, setDontShow] = useState(() => localStorage.getItem(DISMISS_KEY) === "1");

  const handleClose = () => {
    if (dontShow) localStorage.setItem(DISMISS_KEY, "1");
    onClose();
  };

  if (localStorage.getItem(DISMISS_KEY) === "1" && !open) return null;

  const steps = [
    { label: "Connect Gmail", description: "Link your Google account (read-only access)", done: hasConnectedAccount, icon: Mail },
    { label: "Sync emails", description: "Pull in your latest messages", done: hasSyncedEmails, icon: RefreshCw },
    { label: "View Inbox", description: "See your emails inside VantoOS", done: false, icon: Inbox },
    { label: "Switch account filter", description: "Try All Accounts vs single account", done: false, icon: Mail },
    { label: "Try keyboard shortcuts", description: "Press ? on the Email page", done: false, icon: Keyboard },
  ];

  const currentStep = !hasConnectedAccount ? 0 : !hasSyncedEmails ? 1 : 2;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <h3 className="text-base font-semibold mb-1">🚀 Gmail Quick Start</h3>
        <p className="text-sm text-muted-foreground mb-4">Get your inbox running in 60 seconds.</p>

        <div className="space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isDone = i < currentStep || step.done;
            const isCurrent = i === currentStep;
            return (
              <div key={i} className={`flex items-start gap-3 rounded-lg p-2.5 transition-all ${isCurrent ? "bg-primary/5 border border-primary/20" : ""}`}>
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <Circle className={`h-5 w-5 mt-0.5 shrink-0 ${isCurrent ? "text-primary" : "text-muted-foreground/30"}`} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isDone ? "line-through text-muted-foreground" : ""}`}>{step.label}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                {isCurrent && i === 1 && hasConnectedAccount && (
                  <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={onSync} disabled={syncing}>
                    {syncing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Sync
                  </Button>
                )}
                {isCurrent && i === 2 && (
                  <Button size="sm" variant="outline" className="shrink-0 gap-1" onClick={() => { handleClose(); navigate("/email"); }}>
                    <ArrowRight className="h-3 w-3" /> Go
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <Switch checked={dontShow} onCheckedChange={setDontShow} id="dontshow" className="scale-75" />
            <label htmlFor="dontshow" className="text-xs text-muted-foreground cursor-pointer">Don't show again</label>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose}>Skip</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
