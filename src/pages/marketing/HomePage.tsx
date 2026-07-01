import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Sparkles, ShieldCheck, Brain, Globe2, Users, Briefcase,
  ClipboardList, Mail, DollarSign, FolderKanban, BookHeart, LayoutDashboard,
} from "lucide-react";
import Seo from "@/components/marketing/Seo";
import heroImg from "/hero-option-3-branded.jpg.asset.json";

export default function HomePage() {
  return (
    <>
      <Seo
        title="VantoOS — The Executive Operating System"
        description="VantoOS builds AI-powered software for executives, founders and teams. Flagship: the Executive AI Command Center. Built in Africa, serving companies and individuals worldwide."
        path="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "VantoOS",
          url: "https://vantoos.com",
          slogan: "One operating system. Every executive. Every team.",
          description:
            "VantoOS designs and develops AI-powered software for executives, founders and growing teams.",
        }}
      />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar via-sidebar to-accent/30 opacity-95" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-16 md:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div className="text-sidebar-foreground">
            <Badge className="bg-accent/20 text-accent-foreground border-accent/30 mb-5 gap-1.5">
              <Sparkles className="h-3 w-3" /> AI Command Center · BYOK · Built for Africa
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
              The Executive <span className="text-accent">Operating System.</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl opacity-85 max-w-xl leading-relaxed">
              VantoOS is a software house building AI-powered tools for the people who run companies — and the companies they run. Our flagship Command Center turns scattered email, meetings, finance and projects into one calm executive cockpit.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/signin">
                <Button size="lg" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
                  Open the App <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/command-center">
                <Button size="lg" variant="outline" className="bg-transparent border-sidebar-foreground/30 text-sidebar-foreground hover:bg-sidebar-foreground/10">
                  See the Flagship
                </Button>
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-5 max-w-2xl">
              {[
                { v: "30+", l: "Executive modules" },
                { v: "BYOK", l: "Your AI keys, your data" },
                { v: "Two-Key", l: "Governance proven" },
                { v: "Africa", l: "Built local, sold global" },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-2xl md:text-3xl font-bold text-accent">{s.v}</div>
                  <div className="text-xs uppercase tracking-wider opacity-60 mt-1">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-accent/20 blur-3xl rounded-full" />
            <img
              src={heroImg}
              alt="VantoOS — Africa-built AI command center"
              width={1024}
              height={1024}
              className="relative rounded-3xl shadow-2xl border border-sidebar-foreground/10"
            />
          </div>
        </div>
      </section>

      {/* FLAGSHIP STRIP */}
      <section className="py-16 md:py-24 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3">Flagship Product</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              The Executive AI Command Center
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              A single calm cockpit for your day. Six flagship modules, one AI partner that knows your work.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { i: LayoutDashboard, t: "Executive Dashboard", d: "Daily briefing, top priorities, agenda — surfaced before you ask." },
              { i: ClipboardList, t: "Plan: Tasks, Meetings, Reminders", d: "One hub. Dictate it, convert it, snooze it. Nothing slips." },
              { i: Mail, t: "Email Triage", d: "Gmail-connected. AI extracts actions, drafts replies, marks handled." },
              { i: DollarSign, t: "Finance & Invest", d: "Bank imports, ZAR-native, AI mentor, market pulse." },
              { i: FolderKanban, t: "Projects + AI Partner", d: "Per-project strategist with memory, audits, sprint plans, funding pathways." },
              { i: BookHeart, t: "Voice Diary", d: "Speak your strategic thinking. AI partner reasons over it, privately." },
            ].map((f) => (
              <Card key={f.t} className="p-6 hover:shadow-lg transition-shadow border-border/60">
                <div className="h-10 w-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                  <f.i className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-lg mb-1.5">{f.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.d}</p>
              </Card>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link to="/command-center">
              <Button variant="outline" size="lg" className="gap-2">
                Explore the Command Center <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* TWO AUDIENCES */}
      <section className="py-16 md:py-24 bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3">Built for two audiences</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              Companies and individuals — one operating system.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-8 border-border/60">
              <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Briefcase className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold mb-3">For Companies</h3>
              <p className="text-muted-foreground mb-5 leading-relaxed">
                SMEs, enterprises, professional services, MLM networks, distributed teams. Roll out one shared brain across leadership, ops and sales — with governance built in.
              </p>
              <ul className="space-y-2 text-sm">
                {["Multi-user with role-based access", "Two-key governance for sensitive actions", "Shared knowledge base & AI partner", "POPIA/GDPR-aligned data sovereignty"].map((x) => (
                  <li key={x} className="flex gap-2"><span className="text-accent">→</span>{x}</li>
                ))}
              </ul>
            </Card>

            <Card className="p-8 border-border/60">
              <div className="h-12 w-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center mb-4">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-2xl font-bold mb-3">For Individuals</h3>
              <p className="text-muted-foreground mb-5 leading-relaxed">
                Founders, directors, principals, executives, consultants. Replace ten apps with one AI cockpit that schedules, drafts, briefs and remembers.
              </p>
              <ul className="space-y-2 text-sm">
                {["Daily AI briefing & weekly executive pack", "Voice-first capture & dictation", "BYOK — your AI keys, your data", "Mobile-first PWA, install in one tap"].map((x) => (
                  <li key={x} className="flex gap-2"><span className="text-accent">→</span>{x}</li>
                ))}
              </ul>
            </Card>
          </div>

          <p className="text-center mt-10 text-lg italic text-muted-foreground">
            “One operating system. Every executive. Every team.”
          </p>
        </div>
      </section>

      {/* SUITE TEASER */}
      <section className="py-16 md:py-24 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3">The VantoOS Suite</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
              One company. A growing portfolio of executive AI apps.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              VantoOS is the parent company designing every product in the suite — sharing one AI core, one governance model, one data-sovereignty promise.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              { t: "Executive AI Command Center", d: "The flagship cockpit for executives and teams.", b: "Live", href: "/command-center", internal: true },
              { t: "GetWell Hub", d: "WhatsApp-first CRM & AI Prospector for MLM networks.", b: "Live", href: "https://getwellhub.dev", internal: false },
              { t: "GetWell Grow", d: "Downline-first CRM for network-marketing teams.", b: "Live", href: "https://getwellgrow.app", internal: false },
            ].map((p) => (
              <Card key={p.t} className="p-6 border-border/60 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <Badge className="bg-success/15 text-success border-success/30">{p.b}</Badge>
                  <Globe2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-1.5">{p.t}</h3>
                <p className="text-sm text-muted-foreground mb-4">{p.d}</p>
                {p.internal ? (
                  <Link to={p.href} className="text-sm text-accent font-medium inline-flex items-center gap-1 hover:gap-2 transition-all">
                    Learn more <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <a href={p.href} target="_blank" rel="noopener noreferrer" className="text-sm text-accent font-medium inline-flex items-center gap-1 hover:gap-2 transition-all">
                    Visit site <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                )}
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link to="/suite">
              <Button variant="ghost" className="gap-2">
                See all 7 apps (3 live · 4 coming 2026) <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="py-16 md:py-20 bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <ShieldCheck className="h-10 w-10 text-accent mx-auto mb-4" />
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Governance proven. Data sovereign. Africa-built.
          </h2>
          <p className="mt-5 text-lg opacity-80 max-w-2xl mx-auto leading-relaxed">
            Every AI write is receipt-stamped. Every sensitive action passes two-key governance. Your AI keys are yours — VantoOS never holds them.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/investors">
              <Button size="lg" variant="outline" className="bg-transparent border-sidebar-foreground/30 text-sidebar-foreground hover:bg-sidebar-foreground/10">
                Read the Investor Brief
              </Button>
            </Link>
            <Link to="/contact">
              <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                Talk to the Team <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-background">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <Card className="p-10 text-center bg-gradient-to-br from-primary/5 via-background to-accent/10 border-accent/30">
            <Brain className="h-10 w-10 text-accent mx-auto mb-4" />
            <h2 className="text-3xl font-bold tracking-tight">Ready to run your day on VantoOS?</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
              Open the Executive AI Command Center now. Bring your own AI keys. Take back your week.
            </p>
            <Link to="/signin" className="inline-block mt-6">
              <Button size="lg" className="gap-2">
                Open the App <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </Card>
        </div>
      </section>
    </>
  );
}
