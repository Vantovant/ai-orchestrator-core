import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Seo from "@/components/marketing/Seo";
import { Globe2, ShieldCheck, Sparkles, Heart } from "lucide-react";

export default function CompanyPage() {
  return (
    <>
      <Seo
        title="About VantoOS — The Company"
        description="VantoOS is an African-built software house designing AI-powered executive operating systems for companies and individuals. Mission, story, principles."
        path="/company"
      />

      <section className="py-16 md:py-20 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">Our Company</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">A software house for the people who lead.</h1>
          <p className="mt-5 text-lg opacity-85 leading-relaxed">
            VantoOS is an African-built company designing AI-powered operating systems for executives, founders, and growing teams. We don't sell tools — we sell a way of running your week.
          </p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 space-y-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">Our mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              Give every executive — solo founder or multinational director — the same calm command center. Built so that one operator on a laptop in Johannesburg has the same leverage as a chief of staff in New York.
            </p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">Our story</h2>
            <p className="text-muted-foreground leading-relaxed">
              VantoOS started with a single conviction: AI should serve the operator, not replace them. Executives across Africa were drowning in inbox triage, scattered tasks, half-finished spreadsheets and meetings that never converted to action. We built the Executive AI Command Center to fix that — and discovered the same architecture solved the same problem for MLM teams, professional services, and individuals running portfolio careers. That insight became the VantoOS suite.
            </p>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">Principles we won't compromise</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { i: ShieldCheck, t: "Data sovereignty", d: "BYOK is mandatory. Your AI keys, your data, your control. We never hold them." },
                { i: Sparkles, t: "Executive confidence", d: "Every screen looks like the CEO already approved it. No noise. No clutter." },
                { i: Globe2, t: "Africa-built, world-serving", d: "Designed for local realities, engineered to global standards. ZAR-native, POPIA-aligned." },
                { i: Heart, t: "Receipts over silence", d: "Every AI write produces a receipt. Silent failure is forbidden." },
              ].map((p) => (
                <Card key={p.t} className="p-5">
                  <div className="h-10 w-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-3">
                    <p.i className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold mb-1">{p.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.d}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
