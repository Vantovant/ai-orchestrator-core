import { supabase } from "@/integrations/supabase/client";

export interface TrustedSource {
  id: string;
  user_id: string;
  name: string;
  category: string;
  notes: string | null;
  url: string | null;
  is_preferred: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export const trustedSourceService = {
  async list(): Promise<TrustedSource[]> {
    const { data, error } = await supabase
      .from("trusted_sources" as any)
      .select("*")
      .is("deleted_at", null)
      .order("is_preferred", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as TrustedSource[];
  },

  async create(
    source: Pick<TrustedSource, "name"> & Partial<Pick<TrustedSource, "category" | "notes" | "url" | "is_preferred">>
  ): Promise<TrustedSource> {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("trusted_sources" as any)
      .insert({ ...source, user_id: userId } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TrustedSource;
  },

  async update(
    id: string,
    updates: Partial<Pick<TrustedSource, "name" | "category" | "notes" | "url" | "is_preferred">>
  ): Promise<TrustedSource> {
    const { data, error } = await supabase
      .from("trusted_sources" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TrustedSource;
  },

  async softDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from("trusted_sources" as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) throw error;
  },
};
