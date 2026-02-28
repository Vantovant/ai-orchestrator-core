import { supabase } from "@/integrations/supabase/client";

export interface ExecutiveContext {
  id: string;
  user_id: string;
  context_key: string;
  context_value: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const contextService = {
  async list() {
    const { data, error } = await supabase
      .from("executive_context")
      .select("*")
      .is("deleted_at", null)
      .order("context_key");
    if (error) throw error;
    return data as ExecutiveContext[];
  },

  async upsert(context_key: string, context_value: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Check if key exists
    const { data: existing } = await supabase
      .from("executive_context")
      .select("id")
      .eq("context_key", context_key)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from("executive_context")
        .update({ context_value })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as ExecutiveContext;
    }

    const { data, error } = await supabase
      .from("executive_context")
      .insert({ context_key, context_value, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as ExecutiveContext;
  },
};
