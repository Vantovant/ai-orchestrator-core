export interface GuideSection {
  title: string;
  steps: string[];
  tips?: string[];
}

export const pageGuides: Record<string, GuideSection> = {
  "/": {
    title: "Dashboard — Your Command Centre",
    steps: [
      "This is the first thing you see when you log in. It gives you a snapshot of everything happening across your projects, tasks, and finances.",
      "Look at the summary cards at the top — they show you key numbers like how many tasks are due, meetings today, and your financial overview.",
      "Scroll down to see your recent activity and any AI-generated insights or recommendations.",
      "Use the sidebar on the left (or the bottom menu on mobile) to navigate to any other section of VantoOS.",
      "Think of this page as your morning briefing — check it daily to stay on top of everything.",
    ],
    tips: [
      "The dashboard updates in real time as you add tasks, meetings, or financial entries.",
      "If something looks off, hit refresh or navigate away and come back.",
    ],
  },
  "/plan": {
    title: "Plan — Tasks, Meetings, Reminders & Notes",
    steps: [
      "This is where you organise your day-to-day work. You'll see tabs at the top: Tasks, Meetings, Reminders, Notes, and Calendar.",
      "📋 Tasks Tab: Click 'Add Task' to create a new task. Give it a title, set a priority (high/medium/low), and optionally assign a due date or link it to a project.",
      "📅 Meetings Tab: Add meetings with a title, date/time, and optional description. A reminder is automatically created 1 hour before each meeting.",
      "⏰ Reminders Tab: View all your reminders here. You can create manual reminders or they'll be auto-generated from meetings.",
      "📝 Notes Tab: Write daily notes. You can use free-text or structured mode. Notes are saved automatically.",
      "🗓 Calendar Tab: See everything laid out on a calendar view for the week or month.",
      "Use the command bar at the top to quickly create tasks, meetings, or reminders using keyboard shortcuts.",
    ],
    tips: [
      "You can use voice dictation (microphone icon) to add notes hands-free.",
      "The AI can extract action items from your notes — look for the 'Extract Actions' button.",
    ],
  },
  "/email": {
    title: "Email — Your Smart Inbox",
    steps: [
      "This section helps you manage your email with AI-powered triage and organisation.",
      "First, you'll need to connect an email account. Go to Settings if you haven't done this yet.",
      "Once connected, your emails appear in a list. Click any email to read it in full.",
      "Use the category filters (Inbox, Starred, Archived) to sort through your messages.",
      "The AI can suggest which emails are urgent, which need follow-up, and which can wait.",
      "Use keyboard shortcuts for faster email management — check the cheat sheet (keyboard icon).",
    ],
    tips: [
      "Star important emails to find them quickly later.",
      "Archive emails you've dealt with to keep your inbox clean.",
    ],
  },
  "/finance": {
    title: "Finance — Track Your Money",
    steps: [
      "This is your personal and business finance hub. It tracks income, expenses, budgets, and debts.",
      "📊 Overview: See your monthly income vs expenses, net position, and financial health at a glance.",
      "💰 Income Streams: Add your different sources of income (salary, freelance, investments, etc.).",
      "💳 Expenses: Log your expenses by category. You can also import bank statements for automatic categorisation.",
      "📋 Budget: Set up recurring bills and expenses. The system will remind you when payments are due.",
      "🏦 Bank Import: Upload CSV bank statements to automatically import and categorise transactions.",
      "📝 Notes: Add financial notes for each month to track decisions and observations.",
      "Use the AI Finance Mentor for personalised financial advice based on your data.",
    ],
    tips: [
      "All amounts are in South African Rand (ZAR) by default — you can change this in your finance profile.",
      "The AI categorises imported bank transactions automatically, but you can correct them.",
    ],
  },
  "/projects": {
    title: "Projects — Manage Your Ventures",
    steps: [
      "This is where you manage all your projects, ventures, and initiatives.",
      "Click '+ New Project' to create a project. Give it a name, description, and status.",
      "Each project has its own: Tasks, Notes, Links, Accomplishments, and AI Partner.",
      "📌 Pin important projects to keep them at the top of your list.",
      "🚫 Mark projects as 'Blocked' if something is stopping progress — add who/what is blocking and an estimated unblock date.",
      "Click on any project to see its detail page with all related items.",
      "The AI Partner provides strategic guidance specific to each project — ask it questions about next steps, risks, or opportunities.",
    ],
    tips: [
      "Use tags to organise projects by category (e.g., 'Tech', 'Finance', 'Marketing').",
      "The progress bar updates automatically based on completed tasks, or you can set it manually.",
    ],
  },
  "/dashboard/partner": {
    title: "Portfolio Partner — AI Strategic Advisor",
    steps: [
      "This is your AI-powered strategic advisor that looks across ALL your projects.",
      "It analyses your entire portfolio and provides insights on momentum, risks, and opportunities.",
      "Review the Partner Scores — these show momentum, risk level, and sell-readiness for each project.",
      "Ask the AI Partner questions like: 'Which project needs attention?', 'What should I focus on this week?', or 'What are my biggest risks?'",
      "The Partner Memory section stores context about your projects so the AI gives increasingly relevant advice over time.",
    ],
    tips: [
      "The more you use VantoOS, the smarter the Partner becomes — it learns from your projects, tasks, and notes.",
    ],
  },
  "/knowledge": {
    title: "Knowledge Base — Your Second Brain",
    steps: [
      "Upload documents (PDFs, text files) and the AI will index them so you can search and ask questions later.",
      "Click 'Upload' to add a new document to your knowledge base.",
      "Once uploaded, use the search/query box to ask questions about your documents.",
      "For example: 'What does my contract say about termination?' or 'Summarise the key points of this report.'",
      "Documents are securely stored and only accessible by you.",
    ],
    tips: [
      "Upload important documents like contracts, policies, research papers, and business plans.",
      "The AI uses your documents to give more informed answers across the platform.",
    ],
  },
  "/investor-report": {
    title: "Reports — Weekly & Investor Reports",
    steps: [
      "Generate professional reports based on your activity across VantoOS.",
      "Weekly Reports summarise what you accomplished, what's coming up, and any blockers.",
      "Investor Reports provide a high-level view suitable for sharing with stakeholders or investors.",
      "Click 'Generate' to create a new report. The AI pulls data from your tasks, projects, meetings, and finance.",
      "Reports can be copied or shared directly.",
    ],
    tips: [
      "Generate a weekly report every Friday to stay accountable and track progress over time.",
    ],
  },
  "/travel": {
    title: "Travel — Plan Your Trips",
    steps: [
      "Use this section to plan and organise your travel.",
      "Add upcoming trips with destinations, dates, and notes.",
      "Keep track of travel budgets, bookings, and itineraries all in one place.",
      "Link travel to specific projects if you're travelling for business.",
    ],
    tips: [
      "This feature is evolving — more AI-powered travel planning features are coming soon!",
    ],
  },
  "/shopping": {
    title: "Shopping — Track Purchases & Wishlists",
    steps: [
      "Keep track of things you need to buy, wish lists, and purchase history.",
      "Add items with descriptions, prices, and links.",
      "Mark items as purchased when done.",
      "Organise by category to keep things tidy.",
    ],
    tips: [
      "Link shopping items to projects if they're project-related purchases.",
    ],
  },
  "/settings": {
    title: "Settings — Customise VantoOS",
    steps: [
      "This is where you configure your VantoOS experience.",
      "👤 Profile: Set up your personal details, role, and preferences using the Profile Wizard.",
      "🔑 AI Keys: Configure your own API keys for AI providers if you want to use your own (optional — VantoOS provides AI by default).",
      "📧 Email: Connect and manage your email accounts.",
      "⚙️ Preferences: Adjust notification settings, currency, and other preferences.",
    ],
    tips: [
      "Complete the Profile Wizard for the best AI experience — it helps the AI understand your context.",
      "You don't need to bring your own AI keys — VantoOS includes AI access by default.",
    ],
  },
  "/testers": {
    title: "Testers — Admin Status Board",
    steps: [
      "⚠️ This page is only visible to admins.",
      "View all beta testers, their activity levels, and system usage.",
      "Create and manage invite codes to onboard new testers.",
      "Click 'New Invite' to generate an invite code. Set a label, cohort tag, and max uses.",
      "Click the copy icon next to an invite to copy the full invitation message with instructions.",
      "Use the ZAZI Report to generate an AI-powered UX analysis of tester behaviour.",
    ],
    tips: [
      "Share invite codes promptly — they may have limited uses.",
      "Check the tester table regularly to see who is actively using the platform.",
    ],
  },
};

export const fullManualSections = [
  {
    title: "Getting Started",
    content: [
      "Welcome to VantoOS — your AI-powered Executive Operating System. This manual will walk you through every feature, step by step.",
      "1. You received an invite code via message. If you don't have one, ask the person who invited you.",
      "2. Go to the sign-up page link provided in your invitation.",
      "3. Click 'Need an account? Sign up' at the bottom of the login form.",
      "4. Enter your email address and choose a password (minimum 6 characters).",
      "5. Paste your invite code in the 'Invite code' field and click 'Verify'.",
      "6. Once verified (you'll see a green '✓ Valid' badge), click 'Sign Up'.",
      "7. Check your email for a confirmation link — click it to activate your account.",
      "8. Return to the sign-up page and sign in with your email and password.",
      "9. You're in! You'll land on the Dashboard — your command centre.",
    ],
  },
  {
    title: "Navigation",
    content: [
      "VantoOS has a sidebar menu on the left (desktop) or a bottom menu (mobile).",
      "The main sections are: Dashboard, Plan, Email, Finance, Projects, Partner, Knowledge, Reports, Travel, Shopping, and Settings.",
      "Click on any menu item to navigate to that section.",
      "On mobile, tap the hamburger menu (☰) at the top-left for the full menu.",
    ],
  },
];
