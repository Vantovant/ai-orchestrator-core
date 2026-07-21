import { supabase } from "@/integrations/supabase/client";

export interface SyncResult {
  app_key: string;
  ok: boolean;
  spoke_status?: number | null;
  error?: string;
}


export interface HubContact {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  whatsapp_display_name: string | null;
  phone_e164: string | null;
  email: string | null;
  contact_type: string;
  contact_source: string | null;
  contact_confidence: string | null;
  name_needs_confirmation: boolean;
  lead_type: string | null;
  temperature: string | null;
  stage_id: string | null;
  assigned_to: string | null;
  notes: string | null;
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
  id?: string;
  hub_contact_id: string;
  app_key: string;
  remote_id: string;
  last_pushed_at: string | null;
  last_pulled_at: string | null;
  created_at: string;
}

export type HubContactWithLinks = HubContact & { hub_contact_links: HubContactLink[] };

export type ContactEditableFields = Partial<
  Pick<
    HubContact,
    | "full_name"
    | "first_name"
    | "last_name"
    | "whatsapp_display_name"
    | "email"
    | "phone_e164"
    | "contact_type"
    | "contact_source"
    | "contact_confidence"
    | "name_needs_confirmation"
    | "lead_type"
    | "temperature"
    | "stage_id"
    | "assigned_to"
    | "notes"
    | "tags"
    | "consent_email"
    | "consent_sms"
    | "consent_whatsapp"
  >
>;

export const contactService = {
  async list({ includeDeleted = false }: { includeDeleted?: boolean } = {}) {
    let q = supabase
      .from("hub_contacts")
      .select("*, hub_contact_links(*)")
      .order("full_name");
    if (!includeDeleted) q = q.eq("is_deleted", false);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as HubContactWithLinks[];
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

  async update(id: string, updates: ContactEditableFields) {
    const { data, error } = await supabase
      .from("hub_contacts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as HubContact;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("hub_contacts")
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async restore(id: string) {
    const { error } = await supabase
      .from("hub_contacts")
      .update({ is_deleted: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async _pushPullToSpokes(extraBody: Record<string, unknown> = {}): Promise<SyncResult[]> {
    const apps = await this.listApps();
    const spokes = apps.filter((a) => a.role === "spoke");
    const results: SyncResult[] = [];
    for (const app of spokes) {
      try {
        const { data, error } = await supabase.functions.invoke("suite-bridge-hub", {
          body: {
            action: "send",
            app_key: app.app_key,
            body: { kind: "contacts_pull", ...extraBody },
          },
        });
        if (error) throw error;
        const ok = data?.ok ?? false;
        let errMsg: string | undefined;
        if (!ok) {
          const body = data?.spoke_body;
          const bodyErr =
            typeof body === "string"
              ? body.slice(0, 140)
              : body?.error || body?.message || (body ? JSON.stringify(body).slice(0, 140) : undefined);
          errMsg = bodyErr || data?.error || `HTTP ${data?.spoke_status ?? "no response"}`;
        }
        results.push({
          app_key: app.app_key,
          ok,
          spoke_status: data?.spoke_status ?? null,
          error: errMsg,
        });
      } catch (err) {
        results.push({
          app_key: app.app_key,
          ok: false,
          error: (err as Error).message || "request_failed",
        });
      }
    }
    return results;
  },

  async syncNow(): Promise<SyncResult[]> {
    return this._pushPullToSpokes();
  },

  async syncOne(contactId: string): Promise<SyncResult[]> {
    // Touch updated_at so spokes pulling by cursor pick this contact up.
    await supabase
      .from("hub_contacts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", contactId);
    return this._pushPullToSpokes({ contact_id: contactId, targeted: true });
  },
};

