# Audit: Get Well Hub → VantoOS → Google Contacts (read-only)

## Existing route (verified in code)

```text
Get Well Hub (separate app)
  └─ signed POST suite-bridge-hub  action=contacts_upsert (app_key getwell_hub / vanto_crm)
       match: link(app_key,remote_id) → phone_e164 → email; else insert
       writes hub_contacts + hub_contact_links
VantoOS Contacts page → GoogleContactsPanel "Push" button
  └─ google-contacts-push  (manual; signed-in user's google_contacts_accounts row)
       create/update in Google, insert hub_contact_links app_key=google_contacts
```

- Sync is **manual on both legs**. No outbox/queue exists in this project (no `outbox` anywhere in `src/` or `supabase/`). Any Hub outbox lives in the Hub project and isn't visible from here.
- ContactDrawer "Sync now" (`contactService.syncOne`) only signals the other apps to pull. It never calls Google.
- Connector tools (`list_contacts`, `get_contact`, `update_contact`, `add_contact_note`) read and edit `hub_contacts` only. None of them pushes to Google.

## Live state (non-secret)

- hub_contacts: 2,447 rows (zazi_email 1772, vanto_crm 561, getwell_grow 114). Newest Hub-origin row is from 2026-07-20, newest update from 2026-08-05.
- **Soundtech (+27219820662) is not in hub_contacts.** The Hub never delivered it, which matches your `hub_contact_id null`.
- Links by app: zazi_email 1835, getwell_grow 836, vanto_crm 561, **google_contacts 0**. Nothing has ever been pushed to Google.
- Google account vantovant@gmail.com: connected, contacts scope present, owner 13080719…, last_push_at and last_pull_at both empty.
- personal_contacts: one row (903c4962…, owner 13080719…, not_synced).

## Why it fails (three causes, all confirmed)

1. **Backend: the Google push can never succeed.** `google-contacts-push` and `google-contacts-pull` filter `hub_contacts` by `user_id`, but that column doesn't exist. hub_contacts is one shared table with no owner column. Every push or pull run errors out, which explains why there are 0 google_contacts links.
2. **Permissions: the Hub→VantoOS upsert would reject Soundtech as `personal`.** `getwell_hub` is only allowed `mlm/mixed`, so the hub replies `contact_type_not_allowed_for_spoke`. Sending it as `mlm` would wrongly label it a prospect.
3. **Hub side: nothing was sent.** No delivery for this phone exists. The Hub's outbox/log is in the Hub project and still needs checking there.

Ownership: hub_contacts has no owner. Access comes from table rules, and the Google push uses the signed-in user's own connected Google account (13080719…). The Hub owner e336f0a0… is a Hub-project identity and has no meaning in this database.

Deployment vs source: there are no push/pull logs, and I haven't compared the deployed code with the source. Both use the same broken filter, so redeploying alone won't fix anything.

## Is personal_contacts needed?

No. The established source of truth is hub_contacts, with `contact_type` personal already in the enum. Proposal: stop using personal_contacts and the `personal-contact-google-sync` function. Keep the table and row as they are (no destructive change without your confirmation), and decide later whether to remove them.

## Minimal next action (after approval)

1. **Fix google-contacts-push/pull:** remove the `.eq("user_id", …)` filters, and change push to accept `contact_id` only, with no bulk push by default. Redeploy only those two functions.
2. **Allow `personal` for getwell_hub:** one data update on `vos_suite_apps.allowed_contact_types` (`mlm/mixed/personal`). Then the Hub re-sends Soundtech through its normal upsert, with contact_type personal, both consents false, and notes "Repair 17439 – R120 unpaid".
   - Alternative if you don't want to touch the Hub: enter Soundtech once directly in hub_contacts via the VantoOS contact screen, matched on phone.
3. Push that one contact to Google with `contact_id`, then read it back from Google (resourceName + phone).
4. Link task 7202a505… by mentioning the contact in the task notes. hub_contacts has no task link column, so no schema change.

## Rollback

Revert the two function edits and restore allowed_contact_types to `mlm/mixed`. No tables are dropped or added.
