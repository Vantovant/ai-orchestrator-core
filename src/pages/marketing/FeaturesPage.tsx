import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Seo from "@/components/marketing/Seo";
import {
  LayoutDashboard, ClipboardList, Mail, DollarSign, FolderKanban, BookOpen,
  BookHeart, Brain, Bell, Calendar, Plane, ShoppingCart, Users, ShieldAlert,
  FileText, TrendingUp, Mic, MailPlus, BookMarked, ShieldCheck, GitPullRequest,
  Inbox, FlaskConical, Hand, FileEdit, NotebookPen, Activity, UserCheck,
} from "lucide-react";

const userModules = [
  { i: LayoutDashboard, t: "Executive Dashboard", d: "Daily briefing, top priorities, quick-add, agenda preview." },
  { i: ClipboardList, t: "Plan Hub", d: "Tasks, meetings, reminders in one canvas with cross-conversion." },
  { i: Bell, t: "Reminders", d: "Snooze, recur, link to meetings, hint-based meeting conversion." },
  { i: Calendar, t: "Meetings", d: "Side-panel AI Advisor, Action Extractor, meeting prep." },
  { i: Mail, t: "Email Triage", d: "Gmail OAuth, Smart Extract, handled audit trail, key coach." },
  { i: DollarSign, t: "Finance", d: "Bank imports, ZAR-native, AI mentor, budget tab, notes." },
  { i: TrendingUp, t: "Invest & Trade", d: "Daily market pulse for portfolio context." },
  { i: FolderKanban, t: "Projects", d: "Kanban, timeline, table views. TenderOS upgrades, demo wizard." },
  { i: Brain, t: "Project AI Partner", d: "Per-project strategist: memory, sprint plan, sell-readiness, funding." },
  { i: Brain, t: "Portfolio AI Partner", d: "Cross-project: weekly focus, portfolio scan, head-to-head compare." },
  { i: BookOpen, t: "Knowledge Base", d: "Upload PDFs and docs, auto-chunked, retrievable via @knowledge." },
  { i: BookHeart, t: "Voice Diary", d: "Voice-first capture with strict-mode privacy isolation." },
  { i: Mic, t: "Live Dictation", d: "Continuous-restart Web Speech engine across modules." },
  { i: FileText, t: "Investor Report", d: "Auto-generated investor brief with portfolio data." },
  { i: FileText, t: "Weekly Executive Pack", d: "Friday auto-report — wins, blockers, next-week focus." },
  { i: Users, t: "Team", d: "Multi-user testers/team board with engagement metrics." },
  { i: Plane, t: "Travel", d: "Trips, itineraries, expense capture." },
  { i: ShoppingCart, t: "Shopping", d: "Personal & business shopping lists with categories." },
  { i: ShieldCheck, t: "Compliance", d: "South African regulatory reminders & widget." },
  { i: BookMarked, t: "User Manual", d: "Searchable in-app guide with route-specific help." },
];

const adminModules = [
  { i: ShieldAlert, t: "VantoOS Central Brain", d: "Admin command console — governance, traffic, central brain chat." },
  { i: ShieldAlert, t: "Step 5D Console", d: "Two-key governance proof console & approval tracking." },
  { i: GitPullRequest, t: "Approval Gate", d: "Two-distinct-human approvals for sensitive operations." },
  { i: Inbox, t: "Proposal Queue", d: "AI-proposed actions awaiting human review." },
  { i: Activity, t: "Receipt Intelligence", d: "Audit every AI write with receipt analytics." },
  { i: FlaskConical, t: "Dry-Run Actions", d: "Simulate integration actions before going live." },
  { i: Hand, t: "Manual Action Pilot", d: "Track manual operator actions during pilot phases." },
  { i: FileEdit, t: "Integration Drafts", d: "Draft external integration payloads before send." },
  { i: NotebookPen, t: "CRM Internal Notes", d: "Internal note governance with archive validation." },
  { i: Inbox, t: "Inbox Receipts", d: "Inbound receipt intelligence dashboard." },
  { i: MailPlus, t: "Onboarding Emails", d: "12-day onboarding sequence manager." },
  { i: UserCheck, t: "Tester Board", d: "POPIA-compliant tester engagement observability." },
  { i: Activity, t: "Admin Health", d: "System health dashboard across all modules." },
];

function Grid({ items, accent }: { items: typeof userModules; accent: string }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((f) => (
        <Card key={f.t} className="p-5 hover:shadow-md transition-shadow">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${accent}`}>
            <f.i className="h-4.5 w-4.5" />
          </div>
          <h3 className="font-semibold text-sm mb-1">{f.t}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{f.d}</p>
        </Card>
      ))}
    </div>
  );
}

export default function FeaturesPage() {
  return (
    <>
      <Seo
        title="All Features & Modules — VantoOS"
        description="Every module inside VantoOS — user-facing tools and administrator governance surfaces. Plan, email, finance, projects, AI partner, two-key governance and more."
        path="/features"
      />

      <section className="py-16 md:py-20 bg-gradient-to-b from-sidebar to-background text-sidebar-foreground">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <Badge className="bg-accent/20 text-accent border-accent/30 mb-4">Inside VantoOS</Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Every module. Nothing hidden.</h1>
          <p className="mt-5 text-lg opacity-85 max-w-2xl mx-auto">
            Two layers: what users see daily, and what administrators use to govern the system.
          </p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8">
            <Badge variant="outline" className="mb-2">User Modules · {userModules.length}</Badge>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">For the people running the work.</h2>
          </div>
          <Grid items={userModules} accent="bg-accent/15 text-accent" />
        </div>
      </section>

      <section className="py-16 bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8">
            <Badge variant="outline" className="mb-2">Administrator Modules · {adminModules.length}</Badge>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">For the people governing the system.</h2>
            <p className="mt-2 text-muted-foreground max-w-2xl">
              Visible only to authenticated administrators. Two-key governance, receipt audit, integration drafting, pilot tracking.
            </p>
          </div>
          <Grid items={adminModules} accent="bg-primary/10 text-primary" />
        </div>
      </section>
    </>
  );
}
