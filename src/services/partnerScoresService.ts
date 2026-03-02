import { supabase } from "@/integrations/supabase/client";

export interface PartnerScores {
  id: string;
  user_id: string;
  project_id: string;
  sell_readiness_score: number;
  risk_level: string;
  momentum_score: number;
  last_audit_at: string | null;
  last_brief_at: string | null;
  updated_at: string;
}

export const partnerScoresService = {
  async get(projectId: string): Promise<PartnerScores | null> {
    const { data } = await supabase
      .from("project_partner_scores" as any)
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    return data as any;
  },

  async listAll(): Promise<PartnerScores[]> {
    const { data } = await supabase
      .from("project_partner_scores" as any)
      .select("*")
      .order("updated_at", { ascending: false });
    return (data as any) ?? [];
  },

  async upsert(projectId: string, fields: Partial<PartnerScores>): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("project_partner_scores" as any)
      .upsert(
        { ...fields, project_id: projectId, user_id: user.id, updated_at: new Date().toISOString() } as any,
        { onConflict: "user_id,project_id" }
      );
  },
};
