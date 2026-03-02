import { supabase } from "@/integrations/supabase/client";

export interface BudgetItem {
  id: string;
  user_id: string;
  type: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  cadence: string;
  due_day_of_month: number | null;
  due_month_of_year: number | null;
  due_date_custom: string | null;
  start_date: string;
  end_date: string | null;
  autopay: boolean;
  notify_days_before: number;
  status: string;
  category: string | null;
  vendor: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BudgetEvent {
  id: string;
  user_id: string;
  budget_item_id: string;
  due_at: string;
  amount: number;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceNote {
  id: string;
  user_id: string;
  note_month: string;
  content: string;
  created_at: string;
  updated_at: string;
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export const budgetItemService = {
  async list(): Promise<BudgetItem[]> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("finance_budget_items" as any)
      .select("*")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("name");
    if (error) throw error;
    return (data ?? []) as unknown as BudgetItem[];
  },

  async create(item: Partial<BudgetItem>): Promise<BudgetItem> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("finance_budget_items" as any)
      .insert({ ...item, user_id: uid } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as BudgetItem;
  },

  async update(id: string, updates: Partial<BudgetItem>): Promise<BudgetItem> {
    const { data, error } = await supabase
      .from("finance_budget_items" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as BudgetItem;
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from("finance_budget_items" as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) throw error;
  },
};

export const budgetEventService = {
  async listForRange(from: string, to: string): Promise<(BudgetEvent & { budget_item?: BudgetItem })[]> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("finance_budget_events" as any)
      .select("*, finance_budget_items(*)")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .gte("due_at", from)
      .lte("due_at", to)
      .order("due_at");
    if (error) throw error;
    return (data ?? []).map((d: any) => ({
      ...d,
      budget_item: d.finance_budget_items,
    })) as any;
  },

  async markPaid(id: string): Promise<void> {
    const { error } = await supabase
      .from("finance_budget_events" as any)
      .update({ status: "paid", paid_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) throw error;
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase
      .from("finance_budget_events" as any)
      .update({ status } as any)
      .eq("id", id);
    if (error) throw error;
  },
};

export const financeNoteService = {
  async getByMonth(month: string): Promise<FinanceNote | null> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("finance_notes" as any)
      .select("*")
      .eq("user_id", uid)
      .eq("note_month", month)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as FinanceNote | null;
  },

  async upsert(month: string, content: string): Promise<FinanceNote> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("finance_notes" as any)
      .upsert(
        { user_id: uid, note_month: month, content } as any,
        { onConflict: "user_id,note_month" }
      )
      .select()
      .single();
    if (error) throw error;
    return data as unknown as FinanceNote;
  },
};
