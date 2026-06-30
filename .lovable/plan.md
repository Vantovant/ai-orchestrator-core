
# VantoOS Public Website — Build Plan

A marketing site lives at the root of vantoos.com. The existing app (Executive AI Command Center) moves behind `/signin` and `/app/*`. Nothing in the app's logic, governance state, or flags changes — this is additive frontend only.

---

## 1. Positioning

- **VantoOS the company** — an African-built software house designing an operating system for executives, founders, and growing teams.
- **Flagship product** — Executive AI Command Center (this app).
- **Sister products** — GetWell Hub, GetWell Grow (live), plus 4 forthcoming apps (placeholders, "Coming 2026").
- **Clientele** — both **companies** (enterprise, SME, MLM networks, professional services) and **individual executives** (founders, directors, principals).
- **Slogan** — *"One operating system. Every executive. Every team."* (placeholder — confirm with you).
- **Investor angle** — one portfolio, multiple revenue lines, shared AI + governance core.

---

## 2. Sitemap

```
vantoos.com/
├── /                          Home — flagship hero + company intro + suite teaser
├── /command-center            The Executive AI Command Center (flagship deep dive)
├── /features                  All modules — user-facing + admin-facing
├── /how-it-works              From signup → daily execution → governance
├── /suite                     The VantoOS Suite — all apps (live + coming)
│   ├── /suite/command-center  → links to /command-center
│   ├── /suite/getwell-hub     external link card
│   ├── /suite/getwell-grow    external link card
│   └── /suite/coming-soon     4 upcoming apps (teaser cards)
├── /company                   About VantoOS — mission, founder, Africa-built story
├── /clientele                 Who we serve — Companies + Individuals (two columns)
├── /investors                 Investor brief — market, model, traction, roadmap, contact
├── /pricing                   Plans (Individual / Team / Enterprise / BYOK)
├── /contact                   Contact + demo request
├── /signin                    Auth page (existing AuthPage moved here)
├── /app/*                     The current app — all existing routes nest under /app
├── /privacy                   Privacy policy (POPIA-aligned)
└── /terms                     Terms of service
```

Footer-only: `/privacy`, `/terms`, `/contact`.

---

## 3. Page-by-page content

### Home (`/`)
- Hero: *"The Executive Operating System."* Sub: *"AI command center for the people who run companies — and the companies they run."* CTAs: **Open the App** / **See the Flagship**.
- 4 stat strip: Modules · Governance proven · BYOK · Africa-built.
- Flagship preview block (screenshot + 3 bullets → `/command-center`).
- "Built for two audiences" — Companies | Individuals.
- The VantoOS Suite teaser (3 live + 4 coming) → `/suite`.
- Investor strip → `/investors`.
- Footer.

### Command Center (`/command-center`) — flagship deep dive
- Hero + product screenshot.
- Why it exists (executive pain → AI partner solution).
- 6 flagship modules with icons: Dashboard, Plan (Tasks/Meetings/Reminders), Email Triage, Finance, Projects + AI Partner, Voice Diary.
- Governance & Trust block (Two-Key Governance, Write Receipts, BYOK).
- CTA: Open the App.

### Features (`/features`) — all modules
Two clearly labeled sections:
- **User Modules** — Dashboard, Plan, Email, Finance, Projects, Knowledge Base, Voice Diary, Portfolio AI Partner, Reminders, Meetings, Travel, Shopping, Team, Compliance, Weekly Report, Invest, Onboarding.
- **Administrator Modules** — VantoOS Central Brain, Step 5D Console, Approval Gate, Proposal Queue, Receipt Intelligence, Dry-Run Actions, Manual Action Pilot, Integration Drafts, CRM Internal Notes, Inbox Receipts, Onboarding Emails, Tester Board, Admin Health.
Each shown as a card with one-line description.

### How it Works (`/how-it-works`)
4 steps: Sign in → Connect (Email/BYOK) → Daily AI brief → Governance-protected execution.

### Suite (`/suite`)
Grid of all VantoOS apps:
- **Live:** Executive AI Command Center, GetWell Hub, GetWell Grow.
- **Coming 2026:** 4 placeholder cards (you'll confirm names later).
Each card: logo, one-liner, status badge, link.

### Company (`/company`)
Mission, story, founder, Africa-built, design principles (Data Sovereignty, BYOK, Executive Confidence).

### Clientele (`/clientele`)
Two columns:
- **For Companies** — SMEs, MLM teams, professional services, multinationals.
- **For Individuals** — founders, executives, principals, consultants.
Slogan reinforced at bottom.

### Investors (`/investors`)
Market size, business model (subscription + BYOK + enterprise), portfolio approach (one core, many apps), traction snapshot, roadmap, contact CTA.

### Pricing (`/pricing`)
4 tiers: Individual · Team · Enterprise · BYOK-only. "Talk to us" for Enterprise.

### Contact (`/contact`)
Form (name, email, type: user/investor/enterprise, message). Submits to a `contact_inquiries` table.

---

## 4. Routing changes (technical)

- Current `/` (Dashboard) moves to `/app/` and all existing routes nest under `/app/*`.
- New marketing routes added at the root.
- `AuthPage` moves from current path to `/signin`.
- `App.tsx` split into:
  - `<MarketingLayout>` — public header/footer, no auth required.
  - `<AppLayout>` — existing authenticated shell, mounted at `/app/*`.
- Any in-app links to `/` updated to `/app/`.
- 301-style internal redirects: old paths (`/dashboard`, `/plan`, etc.) → `/app/dashboard`, `/app/plan` via React Router.

**Nothing changes** in: edge functions, database, governance flags, Step 5D state, traffic locks, or any business logic.

---

## 5. Design system

- Inherits existing Dark Navy + Sage Green palette and tokens from `index.css`.
- Marketing pages use a lighter surface variant (off-white sections for marketing legibility) while keeping the navy/sage accents.
- Typography pair to be confirmed in a follow-up question after plan approval — default to existing project fonts.
- Hero illustration style similar to GetWell (Africa silhouette / executive motif) — to be generated once direction is confirmed.
- Reuse shadcn components (Card, Button, Badge, Accordion).

---

## 6. SEO & meta

- `react-helmet-async` per-route titles, descriptions, canonicals.
- Sitewide Organization JSON-LD in `index.html`.
- Per-route Product JSON-LD on `/command-center` and each `/suite/*` card.
- `public/robots.txt` allowing all, with `Sitemap: https://vantoos.com/sitemap.xml`.
- `scripts/generate-sitemap.ts` listing all public routes (excludes `/app/*` and `/signin`).
- Canonical and og:url = `https://vantoos.com`.

---

## 7. Build phases & estimated prompts

| Phase | Scope | Est. prompts |
|---|---|---|
| **A** | Routing refactor — nest app under `/app/*`, move auth to `/signin`, add `MarketingLayout` | 1–2 |
| **B** | Home + Command Center + Features pages | 2–3 |
| **C** | Suite + Company + Clientele + Investors | 2 |
| **D** | Pricing + Contact (with `contact_inquiries` table + RLS) | 1–2 |
| **E** | SEO (helmet, sitemap, JSON-LD, robots) + hero illustration | 1 |
| **F** | Polish, mobile QA, link checks, publish | 1 |
| **Total** | | **8–11 prompts** |

---

## 8. What this plan explicitly does NOT do

- Does not touch governance state, Step 5D, approval flags, traffic locks, or any RED/OFF surfaces.
- Does not modify edge functions, RLS, or existing tables (only **adds** `contact_inquiries`).
- Does not start Step 5E or any external automation.
- Does not change the AI agent, Portfolio Partner, or Voice Diary logic.
- Does not rename the existing app — only adds the marketing wrapper around it.

---

## 9. Open questions (answer after approving, or I'll default)

1. **Slogan** — confirm *"One operating system. Every executive. Every team."* or supply your own.
2. **Names of the 4 forthcoming apps** — or leave as "Coming 2026" placeholders.
3. **Pricing tiers and amounts** — or leave as "Contact us" until you decide.
4. **Hero illustration** — Africa-silhouette style like GetWell, or a different motif (executive desk, command room, etc.)?

Approve this and I'll start with **Phase A (routing refactor)** so nothing in the app breaks while the marketing site goes up around it.
