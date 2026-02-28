import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  { title: "Navigate with J / K", description: "Press J to move down, K to move up through your emails. The highlighted email follows your cursor.", icon: "⬆️⬇️" },
  { title: "Open & close with Enter / Esc", description: "Press Enter to open an email, Esc to go back to the list.", icon: "↩️" },
  { title: "Archive with E", description: "Done with an email? Press E to archive it instantly. Gone from your inbox.", icon: "📦" },
  { title: "Snooze with S", description: "Not ready to deal with it? Press S to snooze until tomorrow morning.", icon: "⏰" },
  { title: "Command Bar with Ctrl+K", description: "The power move. Press Ctrl+K (or ⌘K on Mac) to open the command bar. Create tasks, snooze with options, mark as waiting — all from here.", icon: "⚡" },
];

export default function OnboardingTutorial({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm text-center">
        <div className="text-4xl mb-3">{current.icon}</div>
        <h3 className="text-base font-semibold">{current.title}</h3>
        <p className="text-sm text-muted-foreground mt-1">{current.description}</p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />
          ))}
        </div>

        <div className="flex gap-2 mt-4 justify-center">
          {step > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)}>Back</Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep(s => s + 1)}>Next</Button>
          ) : (
            <Button size="sm" onClick={onClose}>Got it! 🚀</Button>
          )}
        </div>

        <button onClick={onClose} className="text-xs text-muted-foreground hover:underline mt-2">
          Skip tutorial
        </button>
      </DialogContent>
    </Dialog>
  );
}
