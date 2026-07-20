import { supabase } from "@/integrations/supabase/client";

export interface HubContact {
  id: string;
  full_name: string;
  phone_e164: string | null;
  email: string | null;
  contact_type: string;
  tags: string[];
  consent_whatsapp: boolean;
  consent_email: boolean;
  consent_sms: boolean;
  unsubscribed_channels: string[];
  source_app: string;
  source_id: string | null;
  version: number;
  last_synced_at: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface HubContactLink {
  id: string;
  hub_contact_id: string;
  app_key: string;
  remote_id: string;
  last_pushed_at: string | null;
  last_pulled_at: string | null;
  created_at: string;
}

export const contactService = {
  async list({ includeDeleted = false }: { includeDeleted?: boolean } = {}) {
    let q = supabase
      .from("hub_contacts")
      .select("*, hub_contact_links(*)")
      .order("full_name");
    if (!includeDeleted) q = q.eq("is_deleted", false);
    const { data, error } = await q;
    if (error) throw error;
    return data as (HubContact & { hub_contact_links: HubContactLink[] })[];
  },

  async listApps() {
    const { data, error } = await supabase
      .from("vos_suite_apps")
      .select("app_key, name, role")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data as { app_key: string; name: string; role: string }[];
  },

  async update(id: string, updates: Partial<Pick<HubContact, "full_name" | "email" | "phone_e164" | "contact_type" | "tags" | "consent_email" | "consent_sms" | "consent_whatsapp">>) {
    const { data, error } = await supabase
      .from("hub_contacts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as HubContact;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("hub_contacts")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
