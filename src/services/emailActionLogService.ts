import { supabase } from "@/integrations/supabase/client";

export type EmailActionType =
  | "finance_income"
  | "finance_expense"
  | "task"
  | "reminder"
  | "meeting"
  | "notes"
  | "archived"
  | "snoozed"
  | "starred"
  | "waiting_on";

export interface EmailActionLogEntry {
  id: string;
  email_id: string;
  action_type: EmailActionType;
  related_id: string | null;
  created_at: string;
}

export const emailActionLogService = {
  async log(emailId: string, actionType: EmailActionType, relatedId?: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("email_action_log" as any)
      .insert({
        user_id: user.id,
        email_id: emailId,
        action_type: actionType,
        related_id: relatedId || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[emailActionLog] insert error:", error);
      return null;
    }
    return data;
  },

  async getForEmail(emailId: string): Promise<EmailActionLogEntry[]> {
    const { data, error } = await supabase
      .from("email_action_log" as any)
      .select("id, email_id, action_type, related_id, created_at")
      .eq("email_id", emailId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[emailActionLog] fetch error:", error);
      return [];
    }
    return (data || []) as unknown as EmailActionLogEntry[];
  },

  async getHandledEmailIds(): Promise<Set<string>> {
    const { data, error } = await supabase
      .from("email_action_log" as any)
      .select("email_id")
      .is("deleted_at", null);

    if (error) {
      console.error("[emailActionLog] fetch handled error:", error);
      return new Set();
    }
    return new Set((data || []).map((r: any) => r.email_id));
  },
};
