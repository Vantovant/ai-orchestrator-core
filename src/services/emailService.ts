/**
 * Email Service – live data layer using Supabase edge functions and direct queries.
 */

import { supabase } from "@/integrations/supabase/client";

export interface EmailAccount {
  id: string;
  email_address: string;
  display_name: string;
  label: string;
  status: "connected" | "disconnected" | "error" | "reconnect_needed";
  provider: string;
  last_sync_at: string | null;
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

export const emailService = {
  async fetchAccounts(): Promise<EmailAccount[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data } = await supabase
      .from("email_accounts")
      .select("id, email_address, display_name, label, status, provider, last_sync_at")
      .eq("user_id", user.id)
      .eq("provider", "gmail")
      .is("deleted_at", null)
      .in("status", ["connected", "reconnect_needed"])
      .order("created_at", { ascending: true });

    return (data ?? []).map(a => ({
      id: a.id,
      email_address: a.email_address,
      display_name: a.display_name || a.email_address,
      label: a.label || "Business",
      status: a.status as EmailAccount["status"],
      provider: a.provider,
      last_sync_at: a.last_sync_at,
    }));
  },

  async fetchEmails(accountId?: string, view: "inbox" | "snoozed" | "waiting" = "inbox"): Promise<EmailMessage[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from("email_messages")
      .select("id, message_id, gmail_thread_id, sender, recipients, cc, subject, snippet, date, label_ids, is_read, is_starred, is_archived, category, urgency, intent, snoozed_until, waiting_on, followup_due_date, account_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(100);

    if (accountId && accountId !== "all") {
      query = query.eq("account_id", accountId);
    }

    // View filters
    const now = new Date().toISOString();
    if (view === "snoozed") {
      query = query.not("snoozed_until", "is", null).gt("snoozed_until", now);
    } else if (view === "waiting") {
      query = query.eq("waiting_on", true);
    } else {
      // inbox: not archived, not currently snoozed
      query = query.eq("is_archived", false);
      query = query.or(`snoozed_until.is.null,snoozed_until.lte.${now}`);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[emailService] fetch error:", error);
      return [];
    }

    return (data ?? []).map(e => ({
      id: e.id,
      account_id: e.account_id,
      message_id: e.message_id,
      thread_id: e.gmail_thread_id || "",
      sender: e.sender,
      recipients: e.recipients || [],
      subject: e.subject,
      snippet: e.snippet || "",
      date: e.date,
      labels: e.label_ids || [],
      is_read: e.is_read,
      is_starred: e.is_starred,
      is_archived: e.is_archived,
      category: e.category,
      urgency: e.urgency,
      intent: e.intent,
      snoozed_until: e.snoozed_until,
      waiting_on: e.waiting_on,
      followup_due_date: e.followup_due_date,
    }));
  },

  async archive(id: string) {
    await supabase.from("email_messages").update({ is_archived: true, updated_at: new Date().toISOString() }).eq("id", id);
  },

  async toggleStar(id: string, currentState: boolean) {
    await supabase.from("email_messages").update({ is_starred: !currentState, updated_at: new Date().toISOString() }).eq("id", id);
  },

  async markRead(id: string) {
    await supabase.from("email_messages").update({ is_read: true, updated_at: new Date().toISOString() }).eq("id", id);
  },

  async snooze(id: string, until: string) {
    await supabase.from("email_messages").update({ snoozed_until: until, updated_at: new Date().toISOString() }).eq("id", id);
  },

  async setWaitingOn(id: string, followupDate?: string) {
    await supabase.from("email_messages").update({
      waiting_on: true,
      followup_due_date: followupDate || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  },

  async unsnooze(id: string) {
    await supabase.from("email_messages").update({ snoozed_until: null, updated_at: new Date().toISOString() }).eq("id", id);
  },
};
