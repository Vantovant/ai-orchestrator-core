import { supabase } from "@/integrations/supabase/client";

export interface Trip {
  id: string;
  user_id: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: string;
  spend_type: string;
  need_vs_want: string | null;
  justification: string | null;
  budgeted_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface TripExpense {
  id: string;
  user_id: string;
  trip_id: string;
  label: string;
  amount: number;
  expense_date: string;
  trusted_source_id: string | null;
  finance_entry_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export const tripService = {
  async list(): Promise<Trip[]> {
    const { data, error } = await supabase
      .from("trips" as any)
      .select("*")
      .is("deleted_at", null)
      .order("start_date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as Trip[];
  },

  async create(
    trip: Pick<Trip, "destination" | "start_date" | "end_date"> &
      Partial<Pick<Trip, "spend_type" | "need_vs_want" | "justification" | "budgeted_amount" | "notes">>
  ): Promise<Trip> {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("trips" as any)
      .insert({ ...trip, user_id: userId } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Trip;
  },

  async update(
    id: string,
    updates: Partial<Pick<Trip, "destination" | "start_date" | "end_date" | "status" | "spend_type" |
      "need_vs_want" | "justification" | "budgeted_amount" | "notes">>
  ): Promise<Trip> {
    const { data, error } = await supabase
      .from("trips" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Trip;
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from("trips" as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) throw error;
  },
};

export const tripExpenseService = {
  async listForTrip(tripId: string): Promise<TripExpense[]> {
    const { data, error } = await supabase
      .from("trip_expenses" as any)
      .select("*")
      .eq("trip_id", tripId)
      .is("deleted_at", null)
      .order("expense_date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as TripExpense[];
  },

  /**
   * Local-only insert. Mirroring this into finance_entries the way the
   * add_trip_expense MCP tool does is intentionally not duplicated here —
   * keeping that logic in one place (the bridge) avoids the two ever
   * disagreeing about how the mirroring works.
   */
  async create(
    expense: Pick<TripExpense, "trip_id" | "label" | "amount"> &
      Partial<Pick<TripExpense, "expense_date" | "trusted_source_id">>
  ): Promise<TripExpense> {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("trip_expenses" as any)
      .insert({ ...expense, user_id: userId } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TripExpense;
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from("trip_expenses" as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) throw error;
  },
};
