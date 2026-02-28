/**
 * Email Service – mock data layer for Phase 1 (no real Gmail API yet).
 * When OAuth is wired up, swap mock helpers for Supabase queries.
 */

export interface EmailAccount {
  id: string;
  email_address: string;
  display_name: string;
  label: string; // Gov / Business / NM / Personal
  status: "connected" | "disconnected" | "error";
  provider: string;
}

export interface EmailMessage {
  id: string;
  account_id: string;
  message_id: string;
  thread_id: string;
  sender: string;
  recipients: string[];
  subject: string;
  snippet: string;
  date: string;
  labels: string[];
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  category: string | null;
  urgency: string | null;
  intent: string | null;
  snoozed_until: string | null;
  waiting_on: boolean;
  followup_due_date: string | null;
}

// ─── Mock accounts ───────────────────────────────────────────────
const MOCK_ACCOUNTS: EmailAccount[] = [
  { id: "acc-1", email_address: "john@govmail.co.za", display_name: "John (Gov)", label: "Gov", status: "connected", provider: "gmail" },
  { id: "acc-2", email_address: "john@mybiz.co.za", display_name: "John (Business)", label: "Business", status: "connected", provider: "gmail" },
  { id: "acc-3", email_address: "john.doe@gmail.com", display_name: "John Personal", label: "Personal", status: "connected", provider: "gmail" },
];

// ─── Mock emails ─────────────────────────────────────────────────
const now = new Date();
const h = (hours: number) => new Date(now.getTime() - hours * 3600000).toISOString();

const MOCK_EMAILS: EmailMessage[] = [
  // Gov account
  { id: "e1", account_id: "acc-1", message_id: "m1", thread_id: "t1", sender: "minister@gov.za", recipients: ["john@govmail.co.za"], subject: "Q3 Budget Review – Action Required", snippet: "Please review the attached Q3 budget allocations and confirm by Friday...", date: h(1), labels: ["INBOX"], is_read: false, is_starred: true, is_archived: false, category: "action_required", urgency: "immediate", intent: "review", snoozed_until: null, waiting_on: false, followup_due_date: null },
  { id: "e2", account_id: "acc-1", message_id: "m2", thread_id: "t2", sender: "compliance@sars.gov.za", recipients: ["john@govmail.co.za"], subject: "PAYE Submission Reminder – March 2026", snippet: "This is a reminder that your PAYE submission for March 2026 is due...", date: h(3), labels: ["INBOX"], is_read: false, is_starred: false, is_archived: false, category: "action_required", urgency: "today", intent: "compliance", snoozed_until: null, waiting_on: false, followup_due_date: "2026-03-07" },
  { id: "e3", account_id: "acc-1", message_id: "m3", thread_id: "t3", sender: "procurement@gov.za", recipients: ["john@govmail.co.za"], subject: "Tender Award Notification", snippet: "We are pleased to inform you that your tender submission has been...", date: h(8), labels: ["INBOX"], is_read: true, is_starred: false, is_archived: false, category: "fyi", urgency: "this_week", intent: "notification", snoozed_until: null, waiting_on: false, followup_due_date: null },
  // Business account
  { id: "e4", account_id: "acc-2", message_id: "m4", thread_id: "t4", sender: "cfo@mybiz.co.za", recipients: ["john@mybiz.co.za"], subject: "Invoice #4021 – Awaiting Approval", snippet: "Hi John, invoice #4021 from SupplyChain Partners is pending your approval...", date: h(0.5), labels: ["INBOX"], is_read: false, is_starred: false, is_archived: false, category: "decision_needed", urgency: "immediate", intent: "approval", snoozed_until: null, waiting_on: false, followup_due_date: null },
  { id: "e5", account_id: "acc-2", message_id: "m5", thread_id: "t5", sender: "hr@mybiz.co.za", recipients: ["john@mybiz.co.za"], subject: "UIF Contribution Report – Feb 2026", snippet: "Attached is the monthly UIF contribution report. Please verify amounts...", date: h(5), labels: ["INBOX"], is_read: false, is_starred: false, is_archived: false, category: "action_required", urgency: "today", intent: "compliance", snoozed_until: null, waiting_on: false, followup_due_date: null },
  { id: "e6", account_id: "acc-2", message_id: "m6", thread_id: "t6", sender: "sales@vendor.com", recipients: ["john@mybiz.co.za"], subject: "Your order has shipped", snippet: "Great news! Your order #ZA-8821 has been dispatched and is expected to arrive...", date: h(12), labels: ["INBOX"], is_read: true, is_starred: false, is_archived: false, category: "fyi", urgency: "low", intent: "notification", snoozed_until: null, waiting_on: true, followup_due_date: "2026-03-04" },
  { id: "e7", account_id: "acc-2", message_id: "m7", thread_id: "t7", sender: "partner@consulting.co.za", recipients: ["john@mybiz.co.za"], subject: "Meeting Re: Partnership Terms", snippet: "Following our call, I'd like to schedule a follow-up meeting to discuss...", date: h(24), labels: ["INBOX"], is_read: true, is_starred: true, is_archived: false, category: "follow_up", urgency: "this_week", intent: "meeting", snoozed_until: null, waiting_on: false, followup_due_date: null },
  // Personal account
  { id: "e8", account_id: "acc-3", message_id: "m8", thread_id: "t8", sender: "notifications@amazon.com", recipients: ["john.doe@gmail.com"], subject: "Your Amazon order has been delivered", snippet: "Your package was delivered today at 2:15 PM. It was left at the front door.", date: h(2), labels: ["INBOX"], is_read: false, is_starred: false, is_archived: false, category: "fyi", urgency: "low", intent: "notification", snoozed_until: null, waiting_on: false, followup_due_date: null },
  { id: "e9", account_id: "acc-3", message_id: "m9", thread_id: "t9", sender: "dentist@healthclinic.co.za", recipients: ["john.doe@gmail.com"], subject: "Appointment Reminder – 5 March", snippet: "This is a reminder of your dental appointment on 5 March 2026 at 10:00 AM.", date: h(6), labels: ["INBOX"], is_read: false, is_starred: false, is_archived: false, category: "action_required", urgency: "this_week", intent: "appointment", snoozed_until: null, waiting_on: false, followup_due_date: null },
  { id: "e10", account_id: "acc-3", message_id: "m10", thread_id: "t10", sender: "friend@gmail.com", recipients: ["john.doe@gmail.com"], subject: "Weekend braai plans?", snippet: "Hey! Are we still on for Saturday? I was thinking we could do it at my place...", date: h(10), labels: ["INBOX"], is_read: true, is_starred: false, is_archived: false, category: "personal", urgency: "low", intent: null, snoozed_until: null, waiting_on: false, followup_due_date: null },
];

// ─── In-memory state (replaced by Supabase when OAuth wired) ─────
let accounts = [...MOCK_ACCOUNTS];
let emails = [...MOCK_EMAILS];

export const emailService = {
  getAccounts(): EmailAccount[] {
    return accounts;
  },

  getEmails(accountId: string | "all", view: "inbox" | "snoozed" | "waiting"): EmailMessage[] {
    let filtered = emails.filter(e => !e.is_archived);
    if (accountId !== "all") filtered = filtered.filter(e => e.account_id === accountId);

    const now = new Date().toISOString();
    switch (view) {
      case "snoozed":
        return filtered.filter(e => e.snoozed_until && e.snoozed_until > now);
      case "waiting":
        return filtered.filter(e => e.waiting_on);
      default: // inbox
        return filtered.filter(e => !e.snoozed_until || e.snoozed_until <= now);
    }
  },

  archive(id: string) {
    const e = emails.find(m => m.id === id);
    if (e) e.is_archived = true;
  },

  toggleStar(id: string) {
    const e = emails.find(m => m.id === id);
    if (e) e.is_starred = !e.is_starred;
  },

  markRead(id: string) {
    const e = emails.find(m => m.id === id);
    if (e) e.is_read = true;
  },

  snooze(id: string, until: string) {
    const e = emails.find(m => m.id === id);
    if (e) e.snoozed_until = until;
  },

  setWaitingOn(id: string, followupDate?: string) {
    const e = emails.find(m => m.id === id);
    if (e) {
      e.waiting_on = true;
      if (followupDate) e.followup_due_date = followupDate;
    }
  },

  unsnooze(id: string) {
    const e = emails.find(m => m.id === id);
    if (e) e.snoozed_until = null;
  },

  getById(id: string): EmailMessage | undefined {
    return emails.find(m => m.id === id);
  },
};
