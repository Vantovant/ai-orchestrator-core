import { supabase } from "@/integrations/supabase/client";

export interface Client {
  id: string;
  user_id: string;
  name: string;
  type: string;
  reference_code: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EntityClientLink {
  id: string;
  user_id: string;
  client_id: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
  deleted_at: string | null;
}

export const clientService = {
  async list() {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .is("deleted_at", null)
      .order("name");
    if (error) throw error;
    return data as Client[];
  },

  async create(client: Pick<Client, "name" | "type"> & Partial<Pick<Client, "reference_code" | "notes">>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("clients")
      .insert({ ...client, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as Client;
  },

  async update(id: string, updates: Partial<Pick<Client, "name" | "type" | "reference_code" | "notes" | "is_active">>) {
    const { data, error } = await supabase
      .from("clients")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Client;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("clients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async linkEntity(clientId: string, entityType: string, entityId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { error } = await supabase
      .from("entity_client_links")
      .upsert({ client_id: clientId, entity_type: entityType, entity_id: entityId, user_id: user.id }, { onConflict: "client_id,entity_type,entity_id" });
    if (error) throw error;
  },

  async unlinkEntity(clientId: string, entityType: string, entityId: string) {
    const { error } = await supabase
      .from("entity_client_links")
      .delete()
      .eq("client_id", clientId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);
    if (error) throw error;
  },

  async getLinksForEntity(entityType: string, entityId: string) {
    const { data, error } = await supabase
      .from("entity_client_links")
      .select("*, clients(*)")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null);
    if (error) throw error;
    return data as (EntityClientLink & { clients: Client })[];
  },

  async getLinksForClient(clientId: string) {
    const { data, error } = await supabase
      .from("entity_client_links")
      .select("*")
      .eq("client_id", clientId)
      .is("deleted_at", null);
    if (error) throw error;
    return data as EntityClientLink[];
  },
};
