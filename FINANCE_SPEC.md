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
| source | text | 'other' | salary / business / network_marketing / bank_statement / other |
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

### 6. bank_accounts (Sprint 3)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| bank_name | text | required | FNB / Standard Bank / Absa / Nedbank / Capitec / TymeBank / Other |
| account_name | text | '' | Cheque / Savings / etc. |
| currency | text | 'ZAR' | |
| last4 | text | null | Last 4 digits for identification |

### 7. bank_statement_imports (Sprint 3)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| bank_account_id | uuid | FK | References bank_accounts |
| file_path | text | required | Storage path in `statements` bucket |
| file_type | text | 'csv' | csv / ofx / qif |
| status | text | 'uploaded' | uploaded / parsing / needs_mapping / review / committed / failed |
| stats_json | jsonb | {} | row_count, credit_total, debit_total, date_range |
| error_message | text | null | |

### 8. bank_transactions (Sprint 3)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| bank_account_id | uuid | FK | References bank_accounts |
| import_id | uuid | FK | References bank_statement_imports |
| txn_date | date | required | |
| description | text | '' | Raw transaction description |
| reference | text | null | |
| amount | numeric(12,2) | 0 | Positive=credit, negative=debit |
| balance | numeric(12,2) | null | Running balance |
| fingerprint_hash | text | required | SHA-256 dedup key, UNIQUE per user |
| category | text | null | Auto-categorized or user-assigned |
| merchant | text | null | Extracted merchant name |
| finance_entry_id | uuid | null | Links to finance_entries when committed |

Indexes: (user_id, txn_date), (user_id, deleted_at), (bank_account_id, txn_date), UNIQUE(user_id, fingerprint_hash)

### 9. merchant_rules (Sprint 3)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| pattern | text | required | Substring match pattern |
| category | text | required | Category to assign |
| priority | integer | 0 | Higher = checked first |

---

## Storage

### `statements` bucket (private)

- Path: `/{user_id}/{import_id}/original.{ext}`
- RLS: Users can only access their own files via `storage.foldername(name)[1] = auth.uid()`

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
  "executiveContext": {},
  "bankInsights": { "bankFees": 0, "subscriptionDrain": 0, "importedTransactions": 0 }
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
  "saContextNotes": [
     "Short, general SA-specific considerations (cashflow discipline, credit risk, compliance reminders)."
  ],
  "disclaimer": "General guidance only. Not legal, tax, or financial advice.",
  "ai_status": "ok|degraded|rate_limited|error",
  "message": "string"
}
```

**Bankability adaptation**:
- unbankable: Cashflow stabilization, avoiding predatory lending, building trust signals
- rebuilding: Balanced advice, credit rebuilding
- bankable: Optimization, term negotiation, structured growth

### bank-import-parse (Sprint 3)

**Input**: `{ import_id, mapping?, skip_rows? }`

**Steps**:
1. Download file from `statements` bucket (server-side via service role)
2. Parse based on file_type (CSV with column mapping, OFX, QIF)
3. Normalize: txn_date ISO, amount signed (credit+, debit-)
4. Extract merchant from description (first tokens)
5. Auto-categorize using SA merchant rules + user merchant_rules
6. Dedup via SHA-256 fingerprint: `sha256(user_id|bank_account_id|txn_date|amount|normalized_description)`
7. Upsert into bank_transactions, skipping duplicates
8. Update import stats_json and status to "review"

**Privacy**: AI sees only summary totals from bank_insights (fees, subscriptions, count), never raw transaction descriptions.

---

## SA Categorization Rules (Built-in)

| Pattern | Category |
|---------|----------|
| Checkers, Shoprite, Woolworths, PnP, Spar | groceries |
| Engen, Shell, Caltex, Sasol, BP | fuel |
| Vodacom, MTN, Cell C, Telkom, Rain | telco |
| Bank fee, Monthly fee, Service fee | bank_fees |
| Uber, Bolt, e-toll, Gautrain | transport |
| Old Mutual, Sanlam, Discovery, Outsurance | insurance |
| Dis-Chem, Clicks, Doctor, Hospital | medical |
| Municipal, Rates, Water, Eskom | municipal |
| SARS, Tax payment, PAYE | tax |
| Netflix, Spotify, DStv, Showmax | subscriptions |
| Rent, Bond, Mortgage | rent |

Users can create custom merchant_rules that override built-in rules.

---

## UI Layout (6-tab structure)

1. **Overview**: Money snapshot cards + recent entries list
2. **Debt Radar**: Active debts with payoff projections + settle/delete
3. **Income Engine**: Streams with target vs actual progress bars
4. **Opportunities**: AI-generated + manual entries with status
5. **Import** (Sprint 3): Bank statement upload → CSV mapping → review → commit
6. **AI Mentor**: Generate finance briefing → structured cards (money plan, debt plan, income plan, risk flags, SA context)

### Import Flow (Sprint 3)

1. Select/create bank account
2. Upload CSV/OFX/QIF file → stored in `statements` bucket
3. If bank preset known: auto-parse; else: CSV column mapping screen
4. Review: totals, categories, SA insights (bank fees, subscriptions, recurring)
5. User can edit categories, exclude transactions, save rules
6. "Commit to Ledger" creates finance_entries and links via finance_entry_id

## CSV Export

- Finance entries: Date, Type, Category, Amount, Source, Notes
- Debts: Lender, Principal, InterestRate, Repayment, DueDay, Status, Notes

---

## Security

- All tables enforce RLS: `auth.uid() = user_id`
- Edge functions verify auth via Authorization header
- Service role key used only for internal persistence (assistant_runs save, storage access)
- No raw SQL; all queries via typed Supabase SDK
- Executive context truncated to prevent token abuse
- Bank statements stored in private bucket; user can only access own files
- AI never sees raw transaction descriptions; only summary totals
