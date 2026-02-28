import { supabase } from "@/integrations/supabase/client";

// ── Types ──

export interface FinanceProfile {
  id: string;
  user_id: string;
  currency: string;
  role_profile: string;
  vat_registered: boolean;
  provisional_tax: boolean;
  payroll_employer: boolean;
  bankability: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FinanceEntry {
  id: string;
  user_id: string;
  type: string;
  category: string;
  amount: number;
  entry_date: string;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Debt {
  id: string;
  user_id: string;
  lender_name: string;
  principal: number;
  interest_rate: number | null;
  repayment_amount: number | null;
  due_day: number | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface IncomeStream {
  id: string;
  user_id: string;
  stream_type: string;
  label: string;
  monthly_target: number;
  current_month_income: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Opportunity {
  id: string;
  user_id: string;
  title: string;
  type: string;
  estimated_value: number | null;
  difficulty: string;
  notes: string | null;
  status: string;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// ── Finance Profile ──

export const financeProfileService = {
  async get(): Promise<FinanceProfile | null> {
    const { data, error } = await supabase
      .from("finance_profiles")
      .select("*")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as FinanceProfile | null;
  },

  async upsert(profile: Partial<Omit<FinanceProfile, "id" | "user_id" | "created_at" | "updated_at" | "deleted_at">>) {
    const userId = await getUserId();
    const existing = await this.get();
    if (existing) {
      const { data, error } = await supabase
        .from("finance_profiles")
        .update(profile)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as FinanceProfile;
    }
    const { data, error } = await supabase
      .from("finance_profiles")
      .insert({ ...profile, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data as FinanceProfile;
  },
};

// ── Finance Entries ──

export const financeEntryService = {
  async list() {
    const { data, error } = await supabase
      .from("finance_entries")
      .select("*")
      .is("deleted_at", null)
      .order("entry_date", { ascending: false });
    if (error) throw error;
    return data as FinanceEntry[];
  },

  async create(entry: Pick<FinanceEntry, "type" | "category" | "amount" | "entry_date"> & Partial<Pick<FinanceEntry, "notes" | "source">>) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("finance_entries")
      .insert({ ...entry, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data as FinanceEntry;
  },

  async update(id: string, updates: Partial<Pick<FinanceEntry, "type" | "category" | "amount" | "entry_date" | "notes" | "source">>) {
    const { data, error } = await supabase
      .from("finance_entries")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return data as FinanceEntry;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("finance_entries")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async monthlySummary(year?: number, month?: number) {
    const entries = await this.list();
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? now.getMonth(); // 0-indexed
    const monthEntries = entries.filter((e) => {
      const d = new Date(e.entry_date);
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    });
    const totalIncome = monthEntries.filter((e) => e.type === "income").reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
    const totalExpense = monthEntries.filter((e) => e.type === "expense").reduce((s, e) => s + Math.abs(Number(e.amount)), 0);

    const categories: Record<string, number> = {};
    monthEntries.filter((e) => e.type === "expense").forEach((e) => {
      categories[e.category] = (categories[e.category] || 0) + Math.abs(Number(e.amount));
    });

    const monthLabel = new Date(targetYear, targetMonth).toLocaleDateString("en-ZA", { month: "short", year: "numeric" });

    return { totalIncome, totalExpense, net: totalIncome - totalExpense, categories, monthLabel };
  },

  async exportCsv() {
    const entries = await this.list();
    const header = "Date,Type,Category,Amount,Source,Notes\n";
    const rows = entries.map((e) =>
      `${e.entry_date},${e.type},${e.category},${e.amount},${e.source},"${(e.notes ?? "").replace(/"/g, '""')}"`
    ).join("\n");
    return header + rows;
  },
};

// ── Debts ──

export const debtService = {
  async list() {
    const { data, error } = await supabase
      .from("debts")
      .select("*")
      .is("deleted_at", null)
      .order("status", { ascending: true });
    if (error) throw error;
    return data as Debt[];
  },

  async create(debt: Pick<Debt, "lender_name" | "principal"> & Partial<Pick<Debt, "interest_rate" | "repayment_amount" | "due_day" | "notes">>) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("debts")
      .insert({ ...debt, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data as Debt;
  },

  async update(id: string, updates: Partial<Pick<Debt, "lender_name" | "principal" | "interest_rate" | "repayment_amount" | "due_day" | "status" | "notes">>) {
    const { data, error } = await supabase
      .from("debts")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return data as Debt;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("debts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async exportCsv() {
    const debts = await this.list();
    const header = "Lender,Principal,InterestRate,Repayment,DueDay,Status,Notes\n";
    const rows = debts.map((d) =>
      `"${d.lender_name}",${d.principal},${d.interest_rate ?? ""},${d.repayment_amount ?? ""},${d.due_day ?? ""},${d.status},"${(d.notes ?? "").replace(/"/g, '""')}"`
    ).join("\n");
    return header + rows;
  },
};

// ── Income Streams ──

export const incomeStreamService = {
  async list() {
    const { data, error } = await supabase
      .from("income_streams")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as IncomeStream[];
  },

  async create(stream: Pick<IncomeStream, "stream_type" | "label" | "monthly_target"> & Partial<Pick<IncomeStream, "current_month_income" | "notes">>) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("income_streams")
      .insert({ ...stream, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data as IncomeStream;
  },

  async update(id: string, updates: Partial<Pick<IncomeStream, "stream_type" | "label" | "monthly_target" | "current_month_income" | "notes">>) {
    const { data, error } = await supabase
      .from("income_streams")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return data as IncomeStream;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("income_streams")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};

// ── Opportunities ──

export const opportunityService = {
  async list() {
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as Opportunity[];
  },

  async create(opp: Pick<Opportunity, "title" | "type"> & Partial<Pick<Opportunity, "estimated_value" | "difficulty" | "notes" | "ai_generated">>) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("opportunities")
      .insert({ ...opp, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data as Opportunity;
  },

  async update(id: string, updates: Partial<Pick<Opportunity, "title" | "type" | "estimated_value" | "difficulty" | "notes" | "status">>) {
    const { data, error } = await supabase
      .from("opportunities")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return data as Opportunity;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("opportunities")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
