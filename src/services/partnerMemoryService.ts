import { supabase } from "@/integrations/supabase/client";

export interface PartnerMemory {
  id: string;
  user_id: string;
  project_id: string;
  north_star: string;
  target_customer: string;
  business_model: string;
  stage: string;
  primary_constraint: string;
  weekly_focus: string;
  key_assumptions: string[];
  key_risks: string[];
  last_partner_summary: string;
  auto_update_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export const partnerMemoryService = {
  async get(projectId: string): Promise<PartnerMemory | null> {
    const { data } = await supabase
      .from("project_partner_memory" as any)
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    return data as any;
  },

  async upsert(projectId: string, fields: Partial<PartnerMemory>): Promise<PartnerMemory> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("project_partner_memory" as any)
      .upsert(
        { ...fields, project_id: projectId, user_id: user.id, updated_at: new Date().toISOString() } as any,
        { onConflict: "user_id,project_id" }
      )
      .select()
      .single();
    if (error) throw error;
    return data as any;
  },
};
