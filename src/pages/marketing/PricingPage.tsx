import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Check, ArrowRight } from "lucide-react";
import Seo from "@/components/marketing/Seo";

const tiers = [
  {
    name: "Individual",
    price: "Contact us",
    desc: "Founders, directors, consultants — one operator, one cockpit.",
    features: ["All user modules", "Voice Diary & dictation", "Project AI Partner", "BYOK required", "Mobile PWA"],
    cta: "Start a trial",
  },
  {
    name: "Team",
    price: "Contact us",
    badge: "Most popular",
    desc: "Up to 25 users. Shared inbox, knowledge, and AI partner.",
    features: ["Everything in Individual", "Multi-user with roles", "Shared knowledge base", "Portfolio AI Partner", "Weekly Executive Pack"],
    cta: "Talk to sales",
  },
  {
    name: "Enterprise",
    price: "Bespoke",
    desc: "Multinationals, professional services, regulated industries.",
    features: ["Everything in Team", "Two-key governance", "Approval gate & receipts", "Custom integrations", "Dedicated success partner", "POPIA / GDPR alignment"],
    cta: "Talk to sales",
  },
  {
    name: "BYOK Only",
    price: "Contact us",
    desc: "Run the platform entirely on your own AI provider keys.",
    features: ["Full app access", "Your AI provider, your keys", "Zero AI usage billed by us", "Data never leaves your control"],
    cta: "Request access",
  },
];

export default function PricingPage() {
  return (
    <>
      <Seo
        title="Pricing — VantoOS"
        description="VantoOS pricing for Individual, Team, Enterprise and BYOK-only tiers. Contact us for tailored quotes."
        path="/pricing"
      />

      <section className="py-16 md:py-20 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">Pricing</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Pricing that respects the operator.</h1>
          <p className="mt-5 text-lg opacity-85">
            BYOK is mandatory — you bring the AI keys, we provide the operating system. Quotes tailored to your team.
          </p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {tiers.map((t) => (
            <Card key={t.name} className={`p-6 flex flex-col ${t.badge ? "border-accent shadow-lg" : ""}`}>
              {t.badge && <Badge className="self-start mb-2 bg-accent text-accent-foreground">{t.badge}</Badge>}
              <h3 className="text-xl font-bold">{t.name}</h3>
              <div className="mt-2 text-2xl font-bold text-accent">{t.price}</div>
              <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
              <ul className="mt-4 space-y-2 text-sm flex-1">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="h-4 w-4 text-accent shrink-0 mt-0.5" />{f}
                  </li>
                ))}
              </ul>
              <Link to="/contact" className="mt-5">
                <Button variant={t.badge ? "default" : "outline"} className="w-full gap-1.5">
                  {t.cta} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </Card>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-8 max-w-2xl mx-auto">
          All tiers require BYOK. VantoOS never holds your AI provider keys. Pilot pricing available for early adopters.
        </p>
      </section>
    </>
  );
}
