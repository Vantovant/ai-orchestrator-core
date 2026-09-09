import { supabase } from "@/integrations/supabase/client";

export interface ShoppingItem {
  id: string;
  user_id: string;
  name: string;
  quantity: number;
  category: string;
  spend_type: string;
  need_vs_want: string | null;
  justification: string | null;
  unit_cost_estimate: number | null;
  actual_cost: number | null;
  is_recurring: boolean;
  is_done: boolean;
  purchased_at: string | null;
  trusted_source_id: string | null;
  finance_entry_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export const shoppingItemService = {
  async list(): Promise<ShoppingItem[]> {
    const { data, error } = await supabase
      .from("shopping_items" as any)
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ShoppingItem[];
  },

  async create(
    item: Pick<ShoppingItem, "name"> &
      Partial<Pick<ShoppingItem, "quantity" | "category" | "spend_type" | "need_vs_want" | "justification" |
        "unit_cost_estimate" | "is_recurring" | "trusted_source_id" | "notes">>
  ): Promise<ShoppingItem> {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("shopping_items" as any)
      .insert({ ...item, user_id: userId } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ShoppingItem;
  },

  async update(
    id: string,
    updates: Partial<Pick<ShoppingItem, "name" | "quantity" | "category" | "spend_type" | "need_vs_want" |
      "justification" | "unit_cost_estimate" | "actual_cost" | "is_recurring" | "trusted_source_id" | "notes">>
  ): Promise<ShoppingItem> {
    const { data, error } = await supabase
      .from("shopping_items" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ShoppingItem;
  },

  /**
   * Mark an item bought. Purely local bookkeeping — logging the matching
   * Finance expense from the app itself (rather than through this method)
   * is a later step; for now the app just records the purchase, and the
   * Claude-side complete_shopping_item MCP tool is what actually offers
   * the "log to Finance" option in a budgeting conversation.
   */
  async complete(id: string, actualCost?: number): Promise<ShoppingItem> {
    const updates: Record<string, unknown> = { is_done: true, purchased_at: new Date().toISOString() };
    if (actualCost !== undefined) updates.actual_cost = actualCost;
    const { data, error } = await supabase
      .from("shopping_items" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ShoppingItem;
  },

  async toggleDone(id: string, isDone: boolean): Promise<ShoppingItem> {
    const updates: Record<string, unknown> = isDone
      ? { is_done: true, purchased_at: new Date().toISOString() }
      : { is_done: false, purchased_at: null };
    const { data, error } = await supabase
      .from("shopping_items" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ShoppingItem;
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from("shopping_items" as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) throw error;
  },
};
