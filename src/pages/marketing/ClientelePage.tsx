import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Briefcase, Users, ArrowRight } from "lucide-react";
import Seo from "@/components/marketing/Seo";

export default function ClientelePage() {
  return (
    <>
      <Seo
        title="Who We Serve — Companies & Individuals | VantoOS"
        description="VantoOS serves both companies and individuals — SMEs, enterprises, professional services, MLM networks, founders, directors and consultants."
        path="/clientele"
      />

      <section className="py-16 md:py-20 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">Who We Serve</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Two audiences. One operating system.</h1>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 grid md:grid-cols-2 gap-6">
          <Card className="p-8">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-5">
              <Briefcase className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold mb-3">For Companies</h2>
            <p className="text-muted-foreground mb-5 leading-relaxed">
              Roll out one shared brain across leadership, ops, and sales.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Small & medium enterprises scaling beyond founder-led ops",
                "Multinationals coordinating leadership across regions",
                "Professional services firms — legal, finance, consulting",
                "MLM and direct-selling networks (via GetWell Hub & Grow)",
                "Distributed teams needing shared inbox, knowledge, and AI partner",
              ].map((x) => (
                <li key={x} className="flex gap-2"><span className="text-accent">→</span>{x}</li>
              ))}
            </ul>
          </Card>

          <Card className="p-8">
            <div className="h-12 w-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center mb-5">
              <Users className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-bold mb-3">For Individuals</h2>
            <p className="text-muted-foreground mb-5 leading-relaxed">
              Replace ten apps with one AI cockpit that thinks alongside you.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Founders running multiple bets and looking for portfolio clarity",
                "Directors and executives who want a real chief of staff",
                "Principals at boutique firms juggling clients and matters",
                "Consultants and specialists who bill by the hour",
                "Anyone tired of inbox triage stealing their mornings",
              ].map((x) => (
                <li key={x} className="flex gap-2"><span className="text-accent">→</span>{x}</li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="text-center mt-16">
          <p className="text-xl md:text-2xl italic text-muted-foreground max-w-3xl mx-auto">
            “One operating system. Every executive. Every team.”
          </p>
          <Link to="/contact" className="inline-block mt-6">
            <Button size="lg" className="gap-2">Talk to us about your team <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>
    </>
  );
}
