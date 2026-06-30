import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, UserPlus, Link2, Sparkles, ShieldCheck } from "lucide-react";
import Seo from "@/components/marketing/Seo";

const steps = [
  {
    n: "01", i: UserPlus, t: "Sign in",
    d: "Create your VantoOS account at vantoos.com/signin. Invite-first onboarding — pilots and early access by request.",
  },
  {
    n: "02", i: Link2, t: "Connect & bring your keys",
    d: "Add Gmail, upload knowledge, paste your AI provider key. BYOK is mandatory — your data sovereignty is non-negotiable.",
  },
  {
    n: "03", i: Sparkles, t: "Daily AI briefing",
    d: "Every morning your Partner reads your calendar, inbox, projects and reminders — and tells you the three things that matter today.",
  },
  {
    n: "04", i: ShieldCheck, t: "Governance-protected execution",
    d: "Approve AI-proposed actions through the approval gate. Two-key for sensitive items. Every write earns a receipt.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <Seo
        title="How VantoOS Works — From Sign-in to Daily Execution"
        description="Four steps from creating your VantoOS account to running your day on an AI command center with two-key governance and BYOK data sovereignty."
        path="/how-it-works"
      />

      <section className="py-16 md:py-20 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">How it works</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">From sign-in to a calmer week — in four steps.</h1>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 space-y-5">
          {steps.map((s) => (
            <Card key={s.n} className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start">
              <div className="text-5xl font-bold text-accent/40 md:w-24">{s.n}</div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                    <s.i className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold">{s.t}</h2>
                </div>
                <p className="text-muted-foreground leading-relaxed">{s.d}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="py-16 bg-muted/40 text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Ready to start?</h2>
          <Link to="/signin" className="inline-block mt-5">
            <Button size="lg" className="gap-2">Open the App <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>
    </>
  );
}
