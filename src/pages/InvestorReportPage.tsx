import { useQuery } from "@tanstack/react-query";
import { taskService } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { meetingService } from "@/services/meetingService";
import { projectService } from "@/services/projectService";
import { financeEntryService } from "@/services/financeService";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Printer, Brain, CheckSquare, Calendar, Bell, FolderKanban,
  DollarSign, BarChart3, Shield, Zap, Globe, Target,
  TrendingUp, Users, Sparkles, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";

/* ─── Helpers ─── */
const fmt = (n: number) =>
  `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid mb-8">
      <h2 className="text-lg font-bold flex items-center gap-2 mb-3 text-primary print:text-black">
        <Icon className="h-5 w-5" /> {title}
      </h2>
      {children}
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── Main ─── */
export default function InvestorReportPage() {
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: taskService.list });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: reminderService.list });
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingService.list });
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectService.list });
  const entries = useQuery({ queryKey: ["finance_entries"], queryFn: financeEntryService.list });

  const isLoading = tasks.isLoading || projects.isLoading || entries.isLoading;

  const now = new Date();
  const allTasks = tasks.data ?? [];
  const activeTasks = allTasks.filter(t => t.status !== "done");
  const completedTasks = allTasks.filter(t => t.status === "done");
  const allProjects = projects.data ?? [];
  const activeProjects = allProjects.filter(p => p.status === "active");
  const allEntries = entries.data ?? [];

  // This month
  const thisMonthEntries = allEntries.filter(e => {
    const d = new Date(e.entry_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const income = thisMonthEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const expense = thisMonthEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);

  const handlePrint = () => window.print();

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto print:max-w-none">
      {/* Navigation + Print — hidden when printing */}
      <div className="p-4 flex items-center justify-between print:hidden sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="flex gap-2">
          <a href="/investor-report"><Button variant="default" size="sm">Investor Report</Button></a>
          <a href="/weekly-report"><Button variant="outline" size="sm">Weekly Report</Button></a>
        </div>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" /> Print / Export PDF
        </Button>
      </div>

      <div className="px-8 pb-16 print:px-0 print:pb-0 space-y-8">
        {/* ═══ COVER ═══ */}
        <div className="text-center py-12 border-b-2 border-primary/20 print:border-black/10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center print:bg-gray-100">
              <Brain className="h-7 w-7 text-primary print:text-black" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight">VantoOS</h1>
          </div>
          <p className="text-xl text-muted-foreground font-medium">AI Executive Command Center</p>
          <p className="text-sm text-muted-foreground mt-2">
            Product & Platform Report — {format(now, "MMMM yyyy")}
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <Badge variant="secondary" className="text-xs">Confidential</Badge>
            <Badge variant="outline" className="text-xs">Investor Pack</Badge>
          </div>
        </div>

        {/* ═══ VISION ═══ */}
        <Section title="Vision & Opportunity" icon={Target}>
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <p className="text-sm leading-relaxed">
              <strong>VantoOS</strong> is a purpose-built AI operating system for executives managing complex, multi-stakeholder professional lives.
              Unlike generic productivity tools, VantoOS acts as a <em>living secretary</em> — proactively surfacing the right information, preparing for meetings,
              managing financial intelligence, and providing PhD-level strategic advice for every project in the user's portfolio.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="font-semibold">Target Market</p>
                <p className="text-xs text-muted-foreground mt-1">C-suite executives, government leaders, legal & accounting professionals in emerging markets (SA focus)</p>
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="font-semibold">Core Differentiator</p>
                <p className="text-xs text-muted-foreground mt-1">AI that understands your context, remembers your strategy, and proactively manages your day — not a chatbot, a co-pilot</p>
              </div>
            </div>
          </div>
        </Section>

        {/* ═══ PLATFORM STATS ═══ */}
        <Section title="Platform Overview" icon={BarChart3}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Total Tasks" value={allTasks.length} sub={`${completedTasks.length} completed`} />
            <MetricCard label="Active Projects" value={activeProjects.length} sub={`${allProjects.length} total`} />
            <MetricCard label="Meetings" value={(meetings.data ?? []).length} />
            <MetricCard label="Reminders" value={(reminders.data ?? []).length} />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-3">
            <MetricCard label="This Month Income" value={fmt(income)} />
            <MetricCard label="This Month Expense" value={fmt(expense)} />
            <MetricCard label="Net" value={fmt(income - expense)} />
          </div>
        </Section>

        {/* ═══ MODULES ═══ */}
        <Section title="Product Modules" icon={Sparkles}>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: Zap, name: "AI Command Center", desc: "Daily briefings, AI-ranked priorities, time-blocked agendas, 3 Commands for Today", status: "Live" },
              { icon: CheckSquare, name: "Plan Hub", desc: "Tasks, reminders, meetings, notes, calendar — unified with voice input & AI extraction", status: "Live" },
              { icon: DollarSign, name: "Finance Intelligence", desc: "Income/expense tracking, debt radar, bank imports, AI mentor, budget engine", status: "Live" },
              { icon: BarChart3, name: "Invest & Trade", desc: "Market pulse, paper trading, watchlists, AI mentor — educational-first approach", status: "Live" },
              { icon: Brain, name: "AI Senior Partner", desc: "PhD-level strategic advice, partner memory, sell-readiness audits, sprint planning", status: "Live" },
              { icon: FolderKanban, name: "Portfolio Partner", desc: "Cross-project command room with momentum, risk, and readiness scoring", status: "Live" },
              { icon: Globe, name: "Funding Pathways", desc: "Verified funding programs with source citations — no hallucinated data", status: "Live" },
              { icon: Shield, name: "Compliance Tracker", desc: "Regulatory deadline tracking for SA professionals (tax, CIPC, POPIA)", status: "Live" },
              { icon: Users, name: "Client & Matter Mgmt", desc: "Cross-entity tagging for legal/professional workflows", status: "Live" },
              { icon: TrendingUp, name: "Weekly Executive Pack", desc: "One-click reports for WhatsApp/email sharing", status: "Live" },
            ].map((mod, i) => (
              <div key={i} className="rounded-xl border border-border p-4 flex gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 print:bg-gray-100">
                  <mod.icon className="h-4.5 w-4.5 text-primary print:text-black" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{mod.name}</p>
                    <Badge variant="outline" className="text-[9px] h-4">{mod.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{mod.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ═══ AI ARCHITECTURE ═══ */}
        <Section title="AI Architecture" icon={Brain}>
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <p className="text-sm leading-relaxed">
              VantoOS employs a <strong>multi-model AI strategy</strong> with automatic fallback, ensuring 99%+ availability.
              All AI calls route through a centralized gateway with rate limiting, POPIA-compliant PII redaction, and structured output validation.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold mb-1">17 Edge Functions</p>
                <p className="text-muted-foreground">Serverless backend covering AI briefings, financial analysis, market data, project strategy, and data processing</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold mb-1">Multi-Model Routing</p>
                <p className="text-muted-foreground">Gemini 2.5 Flash (speed), Gemini 2.5 Pro (reasoning), GPT-5 (fallback) — user-configurable priority</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold mb-1">POPIA Compliance</p>
                <p className="text-muted-foreground">PII automatically redacted before any AI call. SA IDs, bank numbers, addresses stripped from prompts</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="font-semibold mb-1">Anti-Hallucination</p>
                <p className="text-muted-foreground">Funding data verified with source citations. No invented programs or events. Confirm-before-create on all actions</p>
              </div>
            </div>
          </div>
        </Section>

        {/* ═══ PROJECTS ═══ */}
        <Section title="Active Projects" icon={FolderKanban}>
          {activeProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active projects</p>
          ) : (
            <div className="space-y-2">
              {activeProjects.map(p => (
                <div key={p.id} className="rounded-xl border border-border p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{p.name}</p>
                    {p.description && <p className="text-xs text-muted-foreground truncate">{p.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-20">
                      <Progress value={p.progress_manual} className="h-1.5" />
                      <p className="text-[10px] text-muted-foreground text-right mt-0.5">{p.progress_manual}%</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ═══ TECH STACK ═══ */}
        <Section title="Technology Stack" icon={Zap}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              "React 18", "TypeScript", "Tailwind CSS", "Vite",
              "Supabase (PostgreSQL)", "Deno Edge Functions", "TanStack Query", "shadcn/ui",
              "Recharts", "React Router v6", "Zod", "cmdk",
            ].map(tech => (
              <div key={tech} className="rounded-lg border border-border p-2.5 text-center font-medium">
                {tech}
              </div>
            ))}
          </div>
        </Section>

        {/* ═══ SECURITY ═══ */}
        <Section title="Security & Compliance" icon={Shield}>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="grid sm:grid-cols-3 gap-4 text-xs">
              <div>
                <p className="font-semibold mb-1">Data Protection</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Row Level Security on all tables</li>
                  <li>• POPIA-compliant PII handling</li>
                  <li>• Soft-delete for data recovery</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-1">Authentication</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Email/password + email verification</li>
                  <li>• JWT-based session management</li>
                  <li>• Per-user data isolation</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-1">AI Safety</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• No PII in AI prompts</li>
                  <li>• No hallucinated funding data</li>
                  <li>• Confirm-before-create pattern</li>
                </ul>
              </div>
            </div>
          </div>
        </Section>

        {/* ═══ ROADMAP ═══ */}
        <Section title="Roadmap" icon={ArrowRight}>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-success mb-2">✅ Delivered</p>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>• AI Command Center with daily briefings</li>
                <li>• Plan Hub (tasks, reminders, meetings, notes, calendar)</li>
                <li>• Finance intelligence with bank imports & AI mentor</li>
                <li>• Investment dashboard with paper trading</li>
                <li>• AI Senior Partner with memory & funding pathways</li>
                <li>• Portfolio Partner cross-project command room</li>
                <li>• Compliance tracking & weekly reports</li>
                <li>• Voice input & Secretary Mode</li>
              </ul>
            </div>
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm font-semibold text-primary mb-2">🔄 Next</p>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>• Gmail OAuth integration</li>
                <li>• Email-to-itinerary import</li>
                <li>• Mobile PWA optimization</li>
                <li>• Push notifications</li>
                <li>• Multi-currency support</li>
                <li>• Document/contract management</li>
                <li>• Team collaboration features</li>
                <li>• API for third-party integrations</li>
              </ul>
            </div>
          </div>
        </Section>

        {/* ═══ FOOTER ═══ */}
        <div className="border-t border-border pt-6 text-center text-xs text-muted-foreground">
          <p>© {now.getFullYear()} VantoOS — AI Executive Command Center</p>
          <p className="mt-1">This document is confidential and intended for investor review only.</p>
          <p className="mt-1">Generated {format(now, "d MMMM yyyy 'at' HH:mm")}</p>
        </div>
      </div>
    </div>
  );
}
