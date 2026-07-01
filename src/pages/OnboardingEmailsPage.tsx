import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const BASE = "https://vantoos.com/app";

const EMAILS = [
  {
    day: 1,
    subject: "Welcome to VantoOS — Your AI Executive Assistant Starts Now 🚀",
    page: "/",
    pageLabel: "Dashboard",
    body: `Hi [First Name],

Welcome to VantoOS — your new AI-powered Executive Operating System.

Think of VantoOS as your personal chief of staff that lives on your phone or computer. It helps you plan your day, manage projects, track your money, handle emails, and make smarter decisions — all in one place.

TODAY'S TASK: Log in and explore your Dashboard.

👉 ${BASE}/

Your Dashboard is your command centre. It's the first thing you see when you log in. Here's what to look for:

• Summary cards at the top — these show your tasks, meetings, and financial overview at a glance
• Recent activity feed — what's been happening across your projects
• AI insights — smart suggestions to help you stay ahead

Just log in, look around, and get comfortable. Tomorrow we'll show you how to plan your day.

You've got this!
The VantoOS Team`,
  },
  {
    day: 2,
    subject: "Day 2: Plan Your Day Like a Pro — Tasks, Meetings & Reminders",
    page: "/plan",
    pageLabel: "Plan Hub",
    body: `Hi [First Name],

Today we're showing you the most powerful part of VantoOS — the Plan Hub.

This is where you organise everything: tasks, meetings, reminders, notes, and your calendar. All in one place.

👉 ${BASE}/plan

HERE'S WHAT TO DO TODAY:

1. Click the "Tasks" tab at the top
2. Click "+ Add Task" 
3. Type something you need to do today (e.g., "Review quarterly report")
4. Set the priority to "High" and save it

That's it! You just created your first task.

BONUS: Try clicking the "Meetings" tab and add an upcoming meeting. VantoOS will automatically create a reminder 1 hour before it starts.

💡 TIP: You'll see tabs for Tasks, Meetings, Reminders, Notes, and Calendar — each one helps you stay organised. Explore them at your own pace.

Tomorrow: We'll show you how to take notes and let AI extract action items for you.

The VantoOS Team`,
  },
  {
    day: 3,
    subject: "Day 3: Take Notes & Let AI Find Your Action Items 📝",
    page: "/plan?tab=notes",
    pageLabel: "Notes",
    body: `Hi [First Name],

Ever been in a meeting and forgotten what you promised to do? VantoOS fixes that.

👉 ${BASE}/plan?tab=notes

TODAY'S TASK: Write your first daily note.

1. Go to the Notes tab in your Plan Hub
2. Type anything — meeting notes, ideas, to-dos, thoughts for the day
3. Your note saves automatically

HERE'S THE MAGIC: See the "Extract Actions" button? Click it and VantoOS AI will read your notes and pull out any action items, turning them into tasks automatically.

For example, if you wrote "Need to call John about the contract by Friday" — the AI will create a task for that.

💡 TIP: You can also use the microphone icon to dictate notes hands-free. Perfect for when you're driving or in a meeting.

Tomorrow: Managing your email like a superhero.

The VantoOS Team`,
  },
  {
    day: 4,
    subject: "Day 4: Master Your Email Inbox in Minutes ✉️",
    page: "/email",
    pageLabel: "Email",
    body: `Hi [First Name],

Email overload is real. VantoOS helps you handle it faster than ever.

👉 ${BASE}/email

TODAY'S TASK: Explore your Smart Inbox.

Your email section is designed for speed. Here's how it works:

• Your emails are sorted by account (Gov, Business, Personal) — or view them all at once
• Each email shows its urgency level and what action it needs
• Use keyboard shortcuts for lightning-fast management:
  - J/K = move up and down through emails
  - Enter = open an email
  - E = archive it (done!)
  - S = snooze it for later

💡 TIP: Press Ctrl+K (or ⌘K on Mac) to open the Command Bar — it lets you create tasks from emails, snooze with custom times, and more.

Look for the 🎓 tutorial icon when you first open the email page — it'll walk you through everything in 60 seconds.

Tomorrow: Taking control of your finances.

The VantoOS Team`,
  },
  {
    day: 5,
    subject: "Day 5: Track Your Money — Income, Expenses & Budgets 💰",
    page: "/finance",
    pageLabel: "Finance",
    body: `Hi [First Name],

Money matters. VantoOS gives you a clear picture of where your money comes from and where it goes.

👉 ${BASE}/finance

TODAY'S TASK: Add your first income stream.

1. Go to the Finance page
2. Look at the Overview — it shows your monthly snapshot
3. Click on "Income Streams" and add at least one source (salary, freelance work, investments, etc.)
4. Then check out "Expenses" and log one recent expense

WHAT ELSE IS HERE:
• 📋 Budget tab — set up recurring bills so you never miss a payment
• 🏦 Bank Import — upload a CSV bank statement and VantoOS will categorise your transactions automatically
• 🤖 AI Finance Mentor — get personalised financial advice based on YOUR data

💡 TIP: All amounts default to South African Rand (ZAR). You can change your currency in your finance profile.

Tomorrow: Managing your projects like a CEO.

The VantoOS Team`,
  },
  {
    day: 6,
    subject: "Day 6: Your Projects Command Centre 📂",
    page: "/projects",
    pageLabel: "Projects",
    body: `Hi [First Name],

Whether you run a business, lead a team, or manage side hustles — VantoOS helps you track every project in one place.

👉 ${BASE}/projects

TODAY'S TASK: Create your first project.

1. Click "+ New Project"
2. Give it a name and a short description
3. Set the status (active, planning, on hold, etc.)

ONCE YOUR PROJECT IS CREATED, you can:
• Add tasks specifically for that project
• Write project notes
• Save important links
• Log accomplishments (wins!)
• Talk to an AI Partner that gives strategic advice just for that project

📌 Pin your most important projects to keep them at the top.

🚫 If something is blocking a project, mark it as "Blocked" — add who/what is stopping progress and when you expect it to be resolved.

Tomorrow: Meet your AI strategic advisor.

The VantoOS Team`,
  },
  {
    day: 7,
    subject: "Day 7: Your AI Partner — Strategic Advice Across All Projects 🤖",
    page: "/dashboard/partner",
    pageLabel: "Portfolio Partner",
    body: `Hi [First Name],

Imagine having a strategic advisor who knows every one of your projects and can tell you exactly where to focus. That's your Portfolio Partner.

👉 ${BASE}/dashboard/partner

TODAY'S TASK: Ask your AI Partner a question.

Your Portfolio Partner analyses ALL your projects and gives you insights on:
• Which project has the most momentum
• Where the biggest risks are
• What you should focus on this week

Try asking it:
• "Which project needs my attention right now?"
• "What are my biggest risks?"
• "What should I focus on this week?"

💡 TIP: The more you use VantoOS (adding tasks, notes, project updates), the smarter your Partner becomes. It learns from your activity to give increasingly relevant advice.

Tomorrow: Building your second brain with the Knowledge Base.

The VantoOS Team`,
  },
  {
    day: 8,
    subject: "Day 8: Your Knowledge Base — Upload Documents & Ask Questions 🧠",
    page: "/knowledge",
    pageLabel: "Knowledge Base",
    body: `Hi [First Name],

What if you could upload any document — a contract, a business plan, a policy — and then just ASK it questions? That's the Knowledge Base.

👉 ${BASE}/knowledge

TODAY'S TASK: Upload your first document.

1. Click "Upload" and select a PDF or text file
2. Wait for it to be indexed (this takes a few seconds)
3. Then type a question about the document in the search box

For example:
• "What does my contract say about termination?"
• "Summarise the key points of this report"
• "What are the payment terms?"

Your documents are securely stored and only you can access them. The AI uses them to give you better, more informed answers across VantoOS.

💡 TIP: Upload your most important business documents — contracts, proposals, research. The more context VantoOS has, the better it can help you.

Tomorrow: Planning your trips and purchases.

The VantoOS Team`,
  },
  {
    day: 9,
    subject: "Day 9: Travel Plans & Shopping Lists — Life Admin Made Easy ✈️🛒",
    page: "/travel",
    pageLabel: "Travel & Shopping",
    body: `Hi [First Name],

VantoOS isn't just for work — it helps you manage life admin too.

TRAVEL ✈️
👉 ${BASE}/travel

• Add upcoming trips with destinations, dates, and notes
• Track travel budgets and bookings
• Link travel to specific projects if it's a business trip

SHOPPING 🛒
👉 ${BASE}/shopping

• Create shopping lists with items, prices, and links
• Mark items as purchased when done
• Organise by category to keep things tidy
• Link purchases to projects if they're project-related

TODAY'S TASK: Add one upcoming trip OR create a shopping list with 3 items you need to buy.

💡 TIP: More AI-powered features for travel planning are coming soon!

Tomorrow: Your final lesson — settings, reports, and becoming a power user.

The VantoOS Team`,
  },
  {
    day: 10,
    subject: "Day 10: You're a VantoOS Power User Now! ⚡ Final Tips & Settings",
    page: "/settings",
    pageLabel: "Settings & Reports",
    body: `Hi [First Name],

Congratulations! You've made it through 10 days of VantoOS onboarding. Let's wrap up with a few power-user tips.

SETTINGS ⚙️
👉 ${BASE}/settings

• Complete your Profile Wizard — this helps the AI understand your industry, role, and preferences
• To guarantee absolute data sovereignty for this private cohort, a personal OpenAI or Gemini key is required. Go to Settings → AI Keys to connect yours.

REPORTS 📊
👉 ${BASE}/investor-report

• Generate weekly reports that summarise your accomplishments, upcoming work, and blockers
• Create investor-ready reports to share with stakeholders
• The AI pulls data from your tasks, projects, meetings, and finances automatically

💡 PRO TIP: Generate a weekly report every Friday. It keeps you accountable and helps you see progress over time.

NEED HELP ANYTIME?
• Look for the ❓ button on any page — it gives you step-by-step guidance
• Visit the User Manual: ${BASE}/manual
• Download the manual to read offline

Thank you for being a beta tester. Your feedback shapes the future of VantoOS.

Welcome to the future of executive productivity.

The VantoOS Team`,
  },
  {
    day: 11,
    subject: "Day 11: Become Your Own CFO — Budgets, Bank Imports & AI Finance Mentor 📊",
    page: "/finance",
    pageLabel: "Finance Deep-Dive",
    body: `Hi [First Name],

On Day 5 you got a taste of VantoOS Finance. Today we go deeper — into the tools that turn you into your own CFO.

👉 ${BASE}/finance

THREE POWER FEATURES TO EXPLORE TODAY:

1️⃣ BUDGET COMMAND CENTRE
• Click the "Budget" tab
• Add a recurring bill (rent, internet, insurance — anything you pay regularly)
• Set the cadence (monthly, yearly, or custom) and the due day
• VantoOS will auto-generate payment events AND warn you 7 days before each one is due
• Toggle "Autopay" on items that debit automatically so you know what's manual vs automatic

2️⃣ BANK STATEMENT IMPORT
• Click the "Bank Import" tab
• Upload a CSV bank statement from your bank
• VantoOS will parse every transaction, detect merchants, and auto-categorise them (groceries, transport, subscriptions, etc.)
• You can create custom merchant rules so future imports categorise perfectly

3️⃣ AI FINANCE MENTOR
• Click the 🤖 icon in the Finance section
• Ask questions like:
  - "Where am I overspending?"
  - "Can I afford to hire someone next month?"
  - "What's my savings rate?"
• The mentor analyses YOUR actual data — income streams, expenses, debts, and budget — to give personalised advice

💡 TIP: Log your debts too (Finance → Debts). The AI Mentor factors them into its advice, giving you a complete financial picture.

Tomorrow: Managing government tenders like a pro with TenderOS.

The VantoOS Team`,
  },
  {
    day: 12,
    subject: "Day 12: Win More Tenders with TenderOS — Your Bid Command Centre 🏛️",
    page: "/projects",
    pageLabel: "TenderOS",
    body: `Hi [First Name],

If you bid on government or corporate tenders, this is the feature you've been waiting for. TenderOS turns the chaos of tender management into a structured, AI-assisted process.

👉 ${BASE}/projects (create a new project → select "TenderOS" as the solution type)

HERE'S HOW TO GET STARTED:

1️⃣ CREATE A TENDER PROJECT
• Go to Projects → "+ New Project"
• Give it the tender name (e.g., "DOH Medical Supplies RFQ 2026")
• Select "TenderOS" as the solution type

2️⃣ UPLOAD THE TENDER DOCUMENT
• Open your new TenderOS project
• Go to the "Tender Brief" tab and upload the actual tender PDF
• The AI will read the document and extract:
  - Key requirements (mandatory vs optional)
  - Submission deadlines
  - Compliance documents needed
  - Evaluation criteria and weightings

3️⃣ CHECK YOUR BID READINESS SCORE
• VantoOS calculates a real-time Bid Readiness Score based on:
  - 40% Requirements coverage — have you addressed every requirement?
  - 40% Compliance — are your documents (BEE cert, tax clearance, CSD registration) uploaded and valid?
  - 20% Pricing — is your pricing model complete?
• Your score updates as you work, so you always know where you stand

4️⃣ COMPLIANCE VAULT
• Upload your compliance documents (BEE certificate, tax clearance, company registration, etc.)
• VantoOS tracks expiry dates and warns you before anything lapses
• No more losing bids because of an expired document!

5️⃣ AI TENDER ASSISTANT
• Ask the AI questions about the tender document:
  - "What are the mandatory requirements?"
  - "Summarise the evaluation criteria"
  - "What compliance documents do I need?"
• Every AI answer includes citations from the actual tender document — zero hallucination, fully grounded

💡 TIP: Pin your active tenders to keep them at the top of your Projects list. Use the deadline reminders to never miss a submission date.

🎉 That's the end of your onboarding journey! You now know every major feature in VantoOS.

Remember:
• ❓ Help button on every page for step-by-step guidance
• 📖 User Manual: ${BASE}/manual
• 🤖 Your AI Portfolio Partner gets smarter the more you use VantoOS

Welcome to the future of executive productivity.

The VantoOS Team`,
  },
];

function generateDownloadHTML() {
  const rows = EMAILS.map(
    (e) => `
    <div style="page-break-inside:avoid;margin-bottom:40px;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
      <h2 style="color:#0f172a;margin:0 0 4px;">Day ${e.day}: ${e.pageLabel}</h2>
      <p style="color:#6366f1;font-weight:600;margin:0 0 8px;">Subject: ${e.subject}</p>
      <p style="color:#64748b;font-size:13px;margin:0 0 12px;">Link: <a href="${BASE}${e.page}">${BASE}${e.page}</a></p>
      <pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.7;color:#334155;background:#f8fafc;padding:16px;border-radius:6px;">${e.body}</pre>
    </div>`
  ).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>VantoOS 10-Day Onboarding Email Sequence</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#0f172a;}
h1{text-align:center;}p.subtitle{text-align:center;color:#64748b;}</style></head>
<body><h1>🚀 VantoOS — 10-Day Onboarding Email Sequence</h1>
<p class="subtitle">Ready-to-send emails for new beta testers. Replace [First Name] with the recipient's name.</p>
${rows}</body></html>`;
}

export default function OnboardingEmailsPage() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").limit(1)
      .then(({ data }) => setIsAdmin((data ?? []).length > 0));
  }, [user]);

  if (isAdmin === null) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Skeleton className="h-40 w-80" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h2 className="text-lg font-semibold">Admin Access Only</h2>
        <p className="text-sm text-muted-foreground">This page is restricted to administrators.</p>
      </div>
    );
  }

  const copyEmail = (idx: number) => {
    const e = EMAILS[idx];
    const text = `Subject: ${e.subject}\n\n${e.body}`;
    navigator.clipboard.writeText(text);
    toast.success(`Day ${e.day} email copied!`);
  };

  const downloadAll = () => {
    const html = generateDownloadHTML();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "VantoOS_Onboarding_Emails.html";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Email sequence downloaded!");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📧 Onboarding Email Sequence</h1>
          <p className="text-sm text-muted-foreground">10 daily emails to guide new users through every feature</p>
        </div>
        <Button onClick={downloadAll}><Download className="h-4 w-4 mr-2" /> Download All</Button>
      </div>

      {EMAILS.map((e, i) => (
        <Card key={i} className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">Day {e.day} — {e.pageLabel}</span>
              <h3 className="text-sm font-semibold mt-1">{e.subject}</h3>
              <p className="text-xs text-muted-foreground">Link: {BASE}{e.page}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => copyEmail(i)}><Copy className="h-3.5 w-3.5 mr-1" /> Copy</Button>
          </div>
          <pre className="text-xs whitespace-pre-wrap bg-muted/50 p-3 rounded-md leading-relaxed max-h-48 overflow-auto">{e.body}</pre>
        </Card>
      ))}
    </div>
  );
}