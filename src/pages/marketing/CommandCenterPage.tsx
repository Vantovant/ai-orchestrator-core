import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, LayoutDashboard, ClipboardList, Mail, DollarSign,
  FolderKanban, BookHeart, ShieldCheck, Brain, Mic, FileText, BookOpen, Plane,
} from "lucide-react";
import Seo from "@/components/marketing/Seo";

export default function CommandCenterPage() {
  return (
    <>
      <Seo
        title="Executive AI Command Center — VantoOS"
        description="The flagship VantoOS product. AI-powered dashboard, plan, email triage, finance, projects and voice diary — one calm cockpit for executives."
        path="/command-center"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Executive AI Command Center",
          brand: { "@type": "Brand", name: "VantoOS" },
          description:
            "AI-powered executive operating system covering plan, email, finance, projects and voice diary.",
        }}
      />

      <section className="py-16 md:py-24 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-5">Flagship Product</Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Your day, run by an <span className="text-accent">AI partner.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl opacity-85 max-w-2xl mx-auto leading-relaxed">
            The Executive AI Command Center turns scattered work into one calm cockpit. Dashboard. Plan. Email. Finance. Projects. Voice. All connected. All yours.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/signin">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                Open the App <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/features">
              <Button size="lg" variant="outline" className="bg-transparent border-sidebar-foreground/30 text-sidebar-foreground hover:bg-sidebar-foreground/10">
                See all modules
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-3">
            Six flagship modules. One AI brain.
          </h2>
          <p className="text-center text-muted-foreground max-w-2xl mx-auto mb-12">
            Every module shares context. Your Partner reads from all of them — and writes back with a receipt.
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { i: LayoutDashboard, t: "Executive Dashboard", d: "Personalised greeting, agenda, top-5 priorities, quick-add. Your morning, pre-briefed." },
              { i: ClipboardList, t: "Plan Hub", d: "Tasks, Meetings, Reminders in one canvas. Convert any item across types. Dictate, snooze, complete." },
              { i: Mail, t: "Email Triage", d: "Gmail-connected. Smart Extract pulls actions, dates and contacts. Handled stamps audit every reply." },
              { i: DollarSign, t: "Finance & Invest", d: "Bank imports, ZAR-native, AI mentor, budget tracking, daily market pulse." },
              { i: FolderKanban, t: "Projects + AI Partner", d: "Kanban, timeline, scores. Per-project strategist with memory, sprint plans, sell-readiness audits, funding pathways." },
              { i: BookHeart, t: "Voice Diary", d: "Speak your strategic thinking. Strict-mode retrieval — your reflections stay verbatim and private." },
              { i: Brain, t: "Portfolio AI Partner", d: "Cross-project command room. Weekly focus, portfolio scan, compare projects head-to-head." },
              { i: BookOpen, t: "Knowledge Base", d: "Drop PDFs, docs, links. Auto-chunked and retrievable by your AI Partner via @knowledge." },
              { i: Mic, t: "Live Dictation", d: "Continuous-restart Web Speech engine. Talk for an hour, the transcript keeps going." },
              { i: FileText, t: "Weekly Executive Pack", d: "Auto-generated weekly report — accomplishments, blockers, next week's focus. PDF export ready." },
              { i: Plane, t: "Travel & Shopping", d: "Trip planning, itineraries, expense capture, shopping lists. The little things that drain executives." },
              { i: ShieldCheck, t: "Compliance & Receipts", d: "SA regulatory reminders. Every AI mutation produces a Write Receipt — silent failure is forbidden." },
            ].map((f) => (
              <Card key={f.t} className="p-6 hover:shadow-md transition-shadow">
                <div className="h-10 w-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                  <f.i className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-1.5">{f.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-muted/40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-10">
            <Badge variant="outline" className="mb-3">Governance & Trust</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Built like an executive trusts a chief of staff.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { t: "Two-Key Governance", d: "Sensitive actions require two distinct authenticated humans. Proven on the Step 5D drill." },
              { t: "Write Receipts", d: "Every AI-initiated mutation produces a receipt you can audit. Silent failure is prohibited." },
              { t: "BYOK Sovereignty", d: "Your AI provider, your keys. VantoOS never holds them. Your data never leaves your control." },
            ].map((b) => (
              <Card key={b.t} className="p-6">
                <ShieldCheck className="h-6 w-6 text-accent mb-3" />
                <h3 className="font-semibold mb-1.5">{b.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.d}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Open the Command Center.</h2>
          <p className="mt-3 text-muted-foreground">Sign in with your work email. Bring your own AI keys. Start your day calmly.</p>
          <Link to="/signin" className="inline-block mt-6">
            <Button size="lg" className="gap-2">
              Open the App <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}
