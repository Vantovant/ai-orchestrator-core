import { supabase } from "@/integrations/supabase/client";

export interface EmailExtractEntities {
  merchant: string | null;
  amount: number | null;
  currency: string;
  transaction_type: string | null;
  date: string | null;
  account_hint: string | null;
  reference: string | null;
  category_suggestion: string | null;
  vendor_email: string | null;
  subscription_hint: string | null;
  line_items: Array<{ description: string; quantity?: number; unit_price?: number; total?: number }>;
  counterparty?: string | null;
  money_direction?: {
    transaction_type: "income" | "expense" | "transfer" | "bank_fee" | "unknown";
    direction: "in" | "out" | "neutral";
    amount: number | null;
    currency: string | null;
    datetime: string | null;
    reference: string | null;
    counterparty: string | null;
    category: string | null;
    confidence: number;
    reason: string | null;
    ui_action: "create_income" | "create_expense" | "none";
  };
}

export interface SuggestedRoute {
  target: "finance_expense" | "finance_income" | "task" | "meeting" | "reminder" | "notes" | "project";
  account_id: string | null;
  project_id: string | null;
  category: string | null;
  confidence: number;
  reason: string;
}

export interface EmailExtract {
  id?: string;
  user_id: string;
  email_id: string;
  detected_type: string;
  confidence: number;
  summary: string;
  entities_json: EmailExtractEntities;
  suggested_routes_json: SuggestedRoute[];
  requires_user_confirmation: boolean;
  created_at?: string;
  updated_at?: string;
}

export const emailExtractService = {
  async extract(emailId: string, forceRerun = false, selectedAccount?: { last4: string; account_type?: string; account_id?: string }): Promise<{ extract: EmailExtract | null; cached: boolean; error?: string; message?: string }> {
    const { data, error } = await supabase.functions.invoke("email-smart-extract", {
      body: { email_id: emailId, force_rerun: forceRerun, selected_account: selectedAccount || null },
    });

    if (error) {
      console.error("[emailExtractService] invoke error:", error);
      return { extract: null, cached: false, error: error.message };
    }

    if (data?.error) {
      return { extract: null, cached: false, error: data.error, message: data.message };
    }

    return { extract: data?.extract ?? null, cached: data?.cached ?? false };
  },
};
