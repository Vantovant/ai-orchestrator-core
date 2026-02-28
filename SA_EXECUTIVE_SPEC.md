# VantoOS — South African Executive Specification

## Executive Profiles

VantoOS supports multi-role South African executives who operate across sectors:

### Supported Roles

| Role ID | Label | AI Focus Areas |
|---------|-------|---------------|
| `gov_executive` | Government Executive | Cashflow discipline, pension optimization, compliance, debt avoidance |
| `attorney` | Attorney | Billing cycles, trust account compliance, collections, practice/personal separation |
| `accountant` | Accountant | Reporting deadlines, client deliverables, CPD tracking, tax-efficient structuring |
| `network_marketer` | Network Marketer | Weekly targets, expense discipline, cashflow smoothing, team ROI |
| `entrepreneur` | Entrepreneur | Revenue growth, cashflow forecasting, investment timing, scaling |

### Profile Storage

Stored in `user_preferences` table with key `executive_profile`:
```json
{
  "role_profiles": ["gov_executive", "attorney"],
  "default_work_start": "08:00",
  "default_work_end": "17:00",
  "preferred_templates": [],
  "onboarding_complete": true
}
```

### Role-Aware AI Adaptation

The Finance Mentor edge function reads the user's `role_profiles` and injects role-specific instruction blocks into the AI system prompt. This produces meaningfully different outputs:

- **Gov Executive** → debt strategy emphasizes avoiding micro-lenders, pension leverage
- **Attorney** → income plan focuses on billing optimization, collections discipline
- **Network Marketer** → weekly targets, product cost vs earnings analysis
- **Entrepreneur** → cashflow forecasting, investment timing, scaling strategies

## Compliance Center

### Tables

- `compliance_reminders`: User-configurable SARS/VAT/UIF/PAYE deadline reminders

### SA Presets

Pre-built compliance templates for common SA deadlines:
- SARS Provisional Tax (1st & 2nd periods)
- VAT Return monthly submission
- PAYE monthly submission
- UIF monthly contribution
- CIPC Annual Return

### Important Disclaimers

All compliance features provide **reminders only** — never legal, tax, or financial advice. Users are always directed to consult their tax practitioner.

## Client/Matter Tagging

### Tables

- `clients`: Name, type (client/matter/project), reference code
- `entity_client_links`: Links clients to tasks, meetings, and finance entries

### Usage

- Tag any task, meeting, or finance entry with one or more clients/matters
- Filter Plan hub and Finance pages by client/matter
- Quick-create clients inline from the tag picker

## Security

- All tables use RLS with `auth.uid() = user_id`
- Soft deletes via `deleted_at` column
- No sensitive data exposed in AI prompts beyond financial summaries
