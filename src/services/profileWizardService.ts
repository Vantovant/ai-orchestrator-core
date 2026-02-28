import { supabase } from "@/integrations/supabase/client";

export interface ExecutiveProfile {
  role_profiles: string[]; // gov_executive | attorney | accountant | network_marketer | entrepreneur
  default_work_start: string;
  default_work_end: string;
  preferred_templates: string[];
  onboarding_complete: boolean;
}

const DEFAULT_PROFILE: ExecutiveProfile = {
  role_profiles: [],
  default_work_start: "08:00",
  default_work_end: "17:00",
  preferred_templates: [],
  onboarding_complete: false,
};

export const profileWizardService = {
  async get(): Promise<ExecutiveProfile> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("preference_key", "executive_profile")
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...(data.preference_value as any) };
  },

  async save(profile: ExecutiveProfile) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("id")
      .eq("preference_key", "executive_profile")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("user_preferences")
        .update({ preference_value: profile as any })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("user_preferences")
        .insert({ user_id: user.id, preference_key: "executive_profile", preference_value: profile as any });
      if (error) throw error;
    }
  },

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      gov_executive: "Government Executive",
      attorney: "Attorney",
      accountant: "Accountant",
      network_marketer: "Network Marketer",
      entrepreneur: "Entrepreneur",
    };
    return labels[role] ?? role;
  },

  getRoleTips(roles: string[]): string[] {
    const tips: string[] = [];
    if (roles.includes("gov_executive")) tips.push("Focus: cashflow discipline, compliance, pension optimization");
    if (roles.includes("attorney")) tips.push("Focus: billing cycles, trust account compliance, collections");
    if (roles.includes("accountant")) tips.push("Focus: reporting deadlines, client deliverables, CPD tracking");
    if (roles.includes("network_marketer")) tips.push("Focus: weekly targets, team building, expense discipline");
    if (roles.includes("entrepreneur")) tips.push("Focus: revenue growth, cashflow forecasting, investment timing");
    return tips;
  },
};
