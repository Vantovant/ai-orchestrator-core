## Context loaded. Here's the plan.

**Goal:** Merge Central Brain into the Portfolio Partner surface so you have **one AI co-founder** that knows both your projects AND the full VantoOS suite (governance, strategy engine, spokes). Free up the crowded Governance console.

---

### The insight

Both AIs already run on the same edge function (`portfolio-ai-partner`). The only difference is the `@central_brain` context tag, which swaps the retrieval scope. So this is a **UI + mode consolidation**, not a rebuild.

| Today | After |
|---|---|
| Portfolio Partner → projects, tasks, KB | Portfolio Partner → projects + suite governance + strategy engine |
| Central Brain (buried in Governance) → suite tables only | **Removed from Governance** |
| Two chat histories | One unified history |

---

### Plan

**1. Portfolio Partner gets a "Scope" selector** (right next to the existing project pills)
- **All Projects** (current default)
- **VantoOS Suite** (governance + strategy + spokes — what Central Brain does today)
- **Everything** (both merged — the new power mode)

Selecting a scope injects the right context tag (`@central_brain`, `@all_projects`, or both) into the request.

**2. Merged retrieval in the edge function**
- When scope = Everything, run both `retrievePortfolio()` AND `retrieveCentralBrain()` in parallel, concatenate into the prompt.
- Keep token budget safe by trimming each source to top 15 rows.

**3. Quick-action chips** on the empty state, tailored per scope:
- All Projects: Daily review · Portfolio health · Top risks
- VantoOS Suite: Directive status · Spoke health · Pending approvals
- Everything: Executive briefing · What needs my attention today

**4. Remove Central Brain tab from Governance console**
- Delete the tab entry in `VantoOSConsolePage.tsx`.
- Keep `CentralBrainChat.tsx` file for now (unused) in case you want to revert — remove in a follow-up once verified.
- Add a one-line notice in Governance: *"Central Brain has moved to Portfolio Partner → Scope: VantoOS Suite."*

**5. History migration**
- Central Brain threads live in the same `portfolio_ai_threads` table already (verified). They'll just appear in the unified Portfolio Partner sidebar automatically — no data migration needed.
- Add a small "Suite" badge on threads that were created in Central Brain mode so you can still find them.

---

### Technical section (skip if not interested)

Files to change:
- `src/pages/PortfolioPartnerPage.tsx` — add Scope dropdown, pass to service
- `src/services/portfolioChatService.ts` — forward scope → context_tags
- `supabase/functions/portfolio-ai-partner/index.ts` — when both tags present, merge `retrievePortfolio` + `retrieveCentralBrain` outputs
- `src/pages/admin/VantoOSConsolePage.tsx` — remove Central Brain tab, add moved-notice
- `src/components/portfolio/PortfolioPartnerChat.tsx` — add "Suite" badge on threads with central_brain tag in metadata

No DB changes. No new tables. No breaking changes to existing threads.

---

### What you'll experience

Open Portfolio Partner → pick **Everything** → ask *"What happened with the last directive and how does it affect the ZAZI CRM project?"* → get one answer that pulls from both the strategy engine AND the project data.

**Category:** UI + backend (edge function retrieval merge only, no schema work).

Approve and I'll build it.
