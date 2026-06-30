import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Layers, TrendingUp, ShieldCheck, Globe2 } from "lucide-react";
import Seo from "@/components/marketing/Seo";

export default function InvestorsPage() {
  return (
    <>
      <Seo
        title="Investors — VantoOS"
        description="The investor brief for VantoOS: market, business model, portfolio approach, traction, roadmap, and contact for partnership."
        path="/investors"
      />

      <section className="py-16 md:py-20 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">Investor Brief</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">One core. Many apps. Compounding leverage.</h1>
          <p className="mt-5 text-lg opacity-85 leading-relaxed">
            VantoOS is a software house building a portfolio of AI-powered executive products on a shared core. One engineering investment. Multiple revenue lines. Built for African operators — sold globally.
          </p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { i: Globe2, t: "Market", d: "Executive productivity SaaS is a multi-billion-dollar category. Africa-built AI tooling is structurally underserved." },
            { i: Layers, t: "Model", d: "Subscription (Individual/Team/Enterprise) + BYOK + bespoke enterprise rollouts. High gross margin, sticky retention." },
            { i: TrendingUp, t: "Traction", d: "Flagship Command Center live. GetWell Hub & Grow shipping. Pilots running with multinational executives." },
            { i: ShieldCheck, t: "Moat", d: "Two-key governance + Write Receipts + BYOK = enterprise trust most AI startups can't credibly claim." },
          ].map((c) => (
            <Card key={c.t} className="p-6">
              <c.i className="h-6 w-6 text-accent mb-3" />
              <h3 className="font-semibold mb-1.5">{c.t}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.d}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="py-16 bg-muted/40">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">Why VantoOS</h2>
            <p className="text-muted-foreground leading-relaxed">
              Most AI startups build one product. We build a portfolio on one engineering investment. The AI orchestration, governance, retrieval and security layers we built for the Executive AI Command Center are reused across every VantoOS app. Each new vertical (MLM, boardroom, field ops, legal, education) ships faster than the last, with the same trust guarantees.
            </p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">Roadmap</h2>
            <ul className="space-y-2 text-muted-foreground">
              <li><span className="text-accent font-medium">2026 H1:</span> Scale flagship pilots · launch VantoOS Boardroom · open BYOK to broader cohort</li>
              <li><span className="text-accent font-medium">2026 H2:</span> VantoOS Field + VantoOS Legal · multi-tenant enterprise rollouts</li>
              <li><span className="text-accent font-medium">2027:</span> VantoOS Education · cross-app portfolio dashboard for multi-app customers</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">What we're raising</h2>
            <p className="text-muted-foreground leading-relaxed">
              Strategic capital and operating partners. Contact us for the data room, financial model, and a working demo of the flagship Command Center.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 bg-background text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">Let's talk.</h2>
          <p className="mt-3 text-muted-foreground">
            We work with patient, operator-friendly capital. Reach out for the investor pack.
          </p>
          <Link to="/contact" className="inline-block mt-6">
            <Button size="lg" className="gap-2">Request the Investor Pack <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>
    </>
  );
}
