import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, ExternalLink, Sparkles, Clock } from "lucide-react";
import Seo from "@/components/marketing/Seo";

const live = [
  {
    t: "Executive AI Command Center",
    d: "The flagship. AI cockpit for executives and teams. Plan, email, finance, projects, voice diary, two-key governance.",
    href: "/command-center", internal: true,
  },
  {
    t: "GetWell Hub",
    d: "WhatsApp-first CRM & AI Prospector for MLM and direct-selling teams. Trust-first auto-replies, BOP bookings, group campaigns.",
    href: "https://getwellhub.dev", internal: false,
  },
  {
    t: "GetWell Grow",
    d: "Downline-first CRM for network-marketing teams. Talk to every downline on time, every time.",
    href: "https://getwellgrow.app", internal: false,
  },
  {
    t: "Get Well Africa",
    d: "Official APLGO distributor hub for Africa — plant-based Acumullit SA drop lozenges, wellness blog, podcasts and a full income pathway.",
    href: "https://getwellafrica.com", internal: false,
  },
];

const coming = [
  { t: "VantoOS Boardroom", d: "Board-pack assembly, investor updates and meeting governance — for boards and trustees." },
  { t: "VantoOS Field", d: "Mobile-first ops cockpit for distributed field teams: routes, audits, evidence capture." },
  { t: "VantoOS Legal", d: "Matter management & compliance for in-house counsel and SA professional services." },
  { t: "VantoOS Education", d: "AI-powered learning operations for course providers and skills academies." },
];

export default function SuitePage() {
  return (
    <>
      <Seo
        title="The VantoOS Suite — All Apps"
        description="The VantoOS portfolio: Executive AI Command Center, GetWell Hub, GetWell Grow, plus four upcoming apps for boardrooms, field teams, legal and education."
        path="/suite"
      />

      <section className="py-16 md:py-20 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">The Suite</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">One company. A growing portfolio.</h1>
          <p className="mt-5 text-lg opacity-85 max-w-2xl mx-auto">
            VantoOS designs every product in the suite. One AI core, one governance model, one data-sovereignty promise.
          </p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 flex items-center gap-3">
            <Badge className="bg-success/15 text-success border-success/30 gap-1.5"><Sparkles className="h-3 w-3" /> Live</Badge>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Shipping today</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {live.map((p) => (
              <Card key={p.t} className="p-6 flex flex-col hover:shadow-lg transition-shadow">
                <h3 className="text-lg font-bold mb-2">{p.t}</h3>
                <p className="text-sm text-muted-foreground flex-1 mb-4">{p.d}</p>
                {p.internal ? (
                  <Link to={p.href}>
                    <Button variant="outline" size="sm" className="w-full gap-2">
                      Learn more <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                ) : (
                  <a href={p.href} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="w-full gap-2">
                      Visit site <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8 flex items-center gap-3">
            <Badge variant="outline" className="gap-1.5"><Clock className="h-3 w-3" /> Coming 2026</Badge>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">In the pipeline</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {coming.map((p) => (
              <Card key={p.t} className="p-5 border-dashed">
                <h3 className="font-semibold mb-2">{p.t}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.d}</p>
              </Card>
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-6">
            Names indicative — finalised at launch. Investor partners get first look at the roadmap.
          </p>
        </div>
      </section>

      <section className="py-14 bg-background text-center">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold">Building an app for your industry?</h2>
          <p className="mt-2 text-muted-foreground">Talk to us about a VantoOS-powered partnership.</p>
          <Link to="/contact" className="inline-block mt-5">
            <Button size="lg" className="gap-2">Contact the team <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>
    </>
  );
}
