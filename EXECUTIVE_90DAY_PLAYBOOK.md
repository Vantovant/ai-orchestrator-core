# VantoOS — Executive AI 90-Day Momentum Run Playbook

> **Access:** Administrator account only
> **Tone:** Mentor + Strategist + Accountability Partner
> **Core Mantra:** *I honour my word above my mood. I finish what I start. No zero days.*

---

## 1. Operating Layers

The Executive AI operates across four permanent layers on every interaction:

### Layer 1 — CLARITY
| Question | Purpose |
|----------|---------|
| What is my main goal today? | Anchor the day to a single outcome |
| What matters most this week? | Prevent drift from the 90-day target |

### Layer 2 — EXECUTION
| Question | Purpose |
|----------|---------|
| What are my Top 3 tasks? | Force prioritisation over busy-work |
| What income-producing activities must be done? | Protect revenue-generating time |

### Layer 3 — MOMENTUM
| Question | Purpose |
|----------|---------|
| Am I consistent? | Track streaks and pattern breaks |
| Where am I slipping? | Early-warning on habit decay |

### Layer 4 — LEADERSHIP
| Question | Purpose |
|----------|---------|
| Who am I helping today? | Enforce servant-leadership rhythm |
| How am I duplicating? | Scale impact beyond personal effort |

---

## 2. Daily Output Format

### 2.1 Morning Briefing (auto-triggered on first Plan Hub open)

```
🌅 MORNING BRIEFING — [Day X of 90]

🎯 TOP 3 PRIORITIES
1. [Priority 1 — linked to 90-day goal]
2. [Priority 2 — income-producing]
3. [Priority 3 — leadership/duplication]

💰 KEY BUSINESS ACTIONS
- [ ] [Revenue action 1]
- [ ] [Revenue action 2]
- [ ] [CRM/pipeline action]

⚡ ENERGY FOCUS
- Peak energy block: [time] → [highest-value task]
- Guard against: [known energy drain]

📌 REMEMBER
"I honour my word above my mood."
```

### 2.2 Midday Check (triggered at user-configured time or manual)

```
☀️ MIDDAY CHECK — [Day X of 90]

✅ DONE
- [Completed item 1]
- [Completed item 2]

⏳ PENDING
- [Pending item 1] → [blocker or next step]
- [Pending item 2] → [blocker or next step]

⚠️ RISK
- [Any slipping item or missed commitment]

💡 ADJUSTMENT
- [Tactical pivot if needed]
```

### 2.3 Evening Review (triggered on last Plan Hub visit or manual)

```
🌙 EVENING REVIEW — [Day X of 90]

🏆 WINS
- [Win 1]
- [Win 2]

📚 LESSONS
- [What I learned today]
- [What I would do differently]

🔄 ADJUSTMENTS
- [Change for tomorrow]
- [Habit to reinforce]

📊 DAY SCORE: [X/10]
"I finish what I start. No zero days."
```

---

## 3. Weekly Review Format

Generated every Sunday evening or Monday morning:

```
📊 WEEKLY REVIEW — Week [X] of 13

PERFORMANCE SCORE
- Tasks completed: [X/Y] ([%])
- Income actions completed: [X/Y]
- Consistency streak: [X days]
- Meetings held: [X]
- Leadership actions: [X]

STRATEGY ADJUSTMENT
- What worked: [summary]
- What didn't: [summary]
- Next week focus: [1-2 sentence reset]

MOMENTUM STATUS
🟢 On track / 🟡 Slipping / 🔴 Behind

90-DAY GOAL PROGRESS
[Progress bar or percentage]
[Days remaining: X]
```

---

## 4. Integration Points

### 4.1 Email Strategy (ZaziMail / Email Module)

| Trigger | Action |
|---------|--------|
| Morning briefing | Surface unread emails requiring response today |
| Income-producing block | Flag emails from prospects, clients, or revenue leads |
| Evening review | Count emails handled, flag any overdue responses |
| Weekly review | Email response rate, average response time |

**Implementation:** The `plan-ai-secretary` edge function pulls from `email_messages` (unread, starred, follow-up due) and injects into the briefing sections.

### 4.2 CRM Activity (Zazi CRM / Projects + Clients Module)

| Trigger | Action |
|---------|--------|
| Morning briefing | Surface client follow-ups due today |
| Execution layer | List pipeline tasks (tasks tagged to clients) |
| Leadership layer | Identify team/client check-ins needed |
| Weekly review | Client touchpoint frequency, pipeline movement |

**Implementation:** Queries `entity_client_links` joined with `tasks` and `meetings` to surface client-related activity. The `clients` table drives CRM context.

### 4.3 WhatsApp Execution

| Trigger | Action |
|---------|--------|
| Morning briefing | Copy-to-WhatsApp button for sharing priorities with team |
| Midday check | Quick status shareable via WhatsApp |
| Evening review | Shareable win summary for accountability partner |
| Weekly review | Formatted weekly summary for WhatsApp broadcast |

**Implementation:** Each briefing section includes a "Copy to WhatsApp" action that formats output for WhatsApp-friendly plain text (already implemented in `SecretaryBriefing.tsx`).

---

## 5. 90-Day Momentum Tracking

### 5.1 Data Model

Stored in `user_preferences` with key `momentum_run_90`:

```json
{
  "start_date": "2026-03-29",
  "end_date": "2026-06-27",
  "primary_goal": "User-defined 90-day goal",
  "daily_scores": { "2026-03-29": 8, "2026-03-30": 7 },
  "streak_current": 5,
  "streak_best": 12,
  "weekly_reviews": [
    { "week": 1, "score": 78, "status": "on_track" }
  ]
}
```

### 5.2 Zero-Day Prevention

The system enforces "No Zero Days" by:

1. **Morning:** If no tasks are scheduled, auto-suggest 3 minimum-viable actions
2. **Evening:** If no completions logged, prompt for at least 1 micro-win
3. **Streak tracking:** Visual streak counter on Dashboard with break warnings
4. **Accountability:** If 2+ zero days detected, escalate tone in next briefing

### 5.3 Scoring Model

| Metric | Weight | Max Points |
|--------|--------|-----------|
| Top 3 tasks completed | 30% | 3 |
| Income-producing action done | 25% | 2.5 |
| Consistency (no zero day) | 20% | 2 |
| Leadership action taken | 15% | 1.5 |
| Evening review completed | 10% | 1 |
| **Total** | **100%** | **10** |

---

## 6. Tone & Communication Rules

### Always Use
- Direct, mentor-like language
- Strategic framing ("This matters because...")
- Accountability nudges ("You committed to X — what happened?")
- Encouragement after wins ("Strong execution. Keep this rhythm.")

### Never Use
- Passive or vague suggestions
- Apologetic tone ("Sorry to remind you...")
- Generic motivational quotes without context
- Criticism without actionable alternative

### Core Reminders (rotated into briefings)
1. "I honour my word above my mood."
2. "I finish what I start."
3. "No zero days."
4. "Revenue before admin."
5. "Leadership is duplication."
6. "Consistency beats intensity."
7. "The 90 days will pass anyway — build something."

---

## 7. Technical Implementation

### 7.1 Edge Function: `plan-ai-secretary`

The existing secretary edge function supports the following actions relevant to the 90-Day Run:

| Action | Purpose |
|--------|---------|
| `briefing` | Morning briefing generation |
| `prep` | Pre-meeting preparation |
| `meeting_advisor` | Live meeting guidance |
| `midday_check` | Midday status check (new) |
| `evening_review` | Evening review generation (new) |
| `weekly_review` | Weekly performance review (new) |

### 7.2 Dashboard Integration

The `SecretaryBriefing.tsx` component renders the morning briefing on the Plan Hub. The 90-Day context (day number, streak, goal) is injected into the AI prompt via the `executive_context` table or `user_preferences`.

### 7.3 Notification Triggers

| Time | Trigger |
|------|---------|
| User-configured morning time | Morning briefing auto-generation |
| 12:00–13:00 (configurable) | Midday check prompt |
| 18:00–19:00 (configurable) | Evening review prompt |
| Sunday 20:00 / Monday 07:00 | Weekly review generation |

---

## 8. Access Control

- **This playbook and its AI features are restricted to administrator accounts only.**
- Enforced via `has_role(auth.uid(), 'admin')` check in the secretary edge function.
- Non-admin users receive the standard briefing without 90-Day Momentum features.

---

## 9. Success Criteria

After 90 days, the system generates a final report:

- Total days with activity (target: 90/90)
- Best streak achieved
- Average daily score
- Weekly trend graph
- Top accomplishments (pulled from `project_accomplishments`)
- Goal completion assessment
- Recommended next 90-day focus

---

*Document version: 1.0 — March 2026*
*Stored alongside: PLAN_SPEC.md, EMAIL_SPEC.md, MEETING_DRAWER_SPEC.md, DICTATION_ENGINE_SPEC.md, EXECUTIVE_PLAYBOOK.md*
