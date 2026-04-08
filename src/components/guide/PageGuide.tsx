import { useState } from "react";
import { useLocation } from "react-router-dom";
import { HelpCircle, X, ChevronRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { pageGuides } from "./guideContent";

export default function PageGuide() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Match the current route to guide content
  const path = location.pathname;
  const guide = pageGuides[path];

  if (!guide) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-36 right-4 z-50 md:bottom-6 h-12 w-12 rounded-full shadow-lg border-primary/30 bg-background hover:bg-primary hover:text-primary-foreground transition-all"
          aria-label="Page Guide"
        >
          <HelpCircle className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">AI Guide</Badge>
          </div>
          <SheetTitle className="text-xl">{guide.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Here's a step-by-step guide to help you use this page. Follow along — it's easy! 👇
          </p>

          <div className="space-y-3">
            {guide.steps.map((step, i) => (
              <div key={i} className="flex gap-3 items-start rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {i + 1}
                </div>
                <p className="text-sm leading-relaxed">{step}</p>
              </div>
            ))}
          </div>

          {guide.tips && guide.tips.length > 0 && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-yellow-500" />
                <span>Pro Tips</span>
              </div>
              {guide.tips.map((tip, i) => (
                <div key={i} className="flex gap-2 items-start text-sm text-muted-foreground pl-6">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
