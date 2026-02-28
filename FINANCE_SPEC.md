# VantoOS Finance Module — Technical Specification

## Overview

World-class South African executive finance module supporting mixed-income executives (government + private practice + network marketing). Designed for bankable and unbankable users with AI-powered financial mentoring.

---

## Database Tables

All tables: RLS (`auth.uid() = user_id`), soft delete (`deleted_at`), auto-updated timestamps.

### 1. finance_profiles

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| currency | text | 'ZAR' | ISO currency code |
| role_profile | text | 'Business only' | Gov + Business / Business only / Employed only |
| vat_registered | boolean | false | SA VAT registration |
| provisional_tax | boolean | false | SARS provisional taxpayer |
| payroll_employer | boolean | false | Employs staff |
| bankability | text | 'bankable' | bankable / rebuilding / unbankable |

Unique constraint: one active profile per user.

### 2. finance_entries (unified ledger)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| type | text | 'expense' | income / expense |
| category | text | 'general' | User-defined (rent, fuel, legal fees) |
| amount | numeric(12,2) | 0 | ZAR amount |
| entry_date | date | CURRENT_DATE | |
| source | text | 'other' | salary / business / network_marketing / other |
| notes | text | null | |

### 3. debts

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| lender_name | text | required | |
| principal | numeric(12,2) | 0 | Outstanding balance |
| interest_rate | numeric(5,2) | null | Annual % |
| repayment_amount | numeric(12,2) | null | Monthly |
| due_day | integer | null | 1-31 |
| status | text | 'active' | active / settled |

### 4. income_streams

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| stream_type | text | 'salary' | salary / legal/accounting practice / network marketing / side hustle |
| label | text | '' | User-friendly name |
| monthly_target | numeric(12,2) | 0 | |
| current_month_income | numeric(12,2) | 0 | |

### 5. opportunities

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| title | text | required | |
| type | text | 'savings' | savings / income / funding / compliance |
| estimated_value | numeric(12,2) | null | |
| difficulty | text | 'medium' | easy / medium / hard |
| status | text | 'open' | open / in_progress / done / dismissed |
| ai_generated | boolean | false | |

---

## Edge Functions

### finance-snapshot-build

**Token discipline**: Returns curated summary, hard-capped at 4000 chars.

**Response contract**:
```json
{
  "generatedAt": "ISO",
  "currency": "ZAR",
  "roleProfile": "Gov + Business",
  "bankability": "bankable",
  "taxFlags": { "vat": false, "provisional": false, "payroll": false },
  "last30Days": { "income": 0, "expense": 0, "net": 0 },
  "topExpenseCategories": [{ "category": "string", "total": 0 }],
  "debtSummary": { "count": 0, "totalOutstanding": 0, "nextDue": [] },
  "incomeStreams": [{ "type": "string", "label": "string", "target": 0, "actual": 0 }],
  "latestEntries": [],
  "executiveContext": {}
}
```

### finance-mentor

**Input**: ONLY finance-snapshot-build output + truncated executive_context.

**Response contract (always HTTP 200)**:
```json
{
  "moneyPlan": {
    "thisWeek": [{ "action": "", "impact": "R...", "reason": "" }],
    "thisMonth": [{ "action": "", "impact": "R...", "reason": "" }]
  },
  "debtPlan": {
    "strategy": "avalanche|snowball|hybrid",
    "nextSteps": ["string"]
  },
  "incomePlan": {
    "increaseIncomeActions": ["string"],
    "opportunities": ["string"]
  },
  "riskFlags": ["string"],
  "saContextNotes": ["string"],
  "disclaimer": "General guidance only. Not legal, tax, or financial advice.",
  "ai_status": "ok|degraded|rate_limited|error",
  "message": "string"
}
```

**Bankability adaptation**:
- unbankable: Cashflow stabilization, avoiding predatory lending, building trust signals
- rebuilding: Balanced advice, credit rebuilding
- bankable: Optimization, term negotiation, structured growth

---

## UI Layout (5-tab structure)

1. **Overview**: Money snapshot cards + recent entries list
2. **Debt Radar**: Active debts with payoff projections + settle/delete
3. **Income Engine**: Streams with target vs actual progress bars
4. **Opportunities**: AI-generated + manual entries with status
5. **AI Mentor**: Generate finance briefing → structured cards (money plan, debt plan, income plan, risk flags, SA context)

## CSV Export

- Finance entries: Date, Type, Category, Amount, Source, Notes
- Debts: Lender, Principal, InterestRate, Repayment, DueDay, Status, Notes

---

## Security

- All tables enforce RLS: `auth.uid() = user_id`
- Edge functions verify auth via Authorization header
- Service role key used only for internal persistence (assistant_runs save)
- No raw SQL; all queries via typed Supabase SDK
- Executive context truncated to prevent token abuse
