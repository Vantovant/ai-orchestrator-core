import { supabase } from "@/integrations/supabase/client";

export interface SecretarySettings {
  secretary_mode: boolean;
  morning_briefing: boolean;
  pre_meeting_prompts: boolean;
  end_of_day_review: boolean;
}

const DEFAULT_SETTINGS: SecretarySettings = {
  secretary_mode: false,
  morning_briefing: true,
  pre_meeting_prompts: true,
  end_of_day_review: true,
};

const PREF_KEY = "secretary_mode_settings";
const LAST_BRIEFING_KEY = "last_briefing_date";

export const secretaryService = {
  async getSettings(): Promise<SecretarySettings> {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("preference_value")
      .eq("preference_key", PREF_KEY)
      .maybeSingle();
    if (error) throw error;
    if (!data) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(data.preference_value as any) };
  },

  async saveSettings(settings: SecretarySettings) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data: existing } = await supabase
      .from("user_preferences")
      .select("id")
      .eq("preference_key", PREF_KEY)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("user_preferences")
        .update({ preference_value: settings as any })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("user_preferences")
        .insert({ user_id: user.id, preference_key: PREF_KEY, preference_value: settings as any });
    }
  },

  async getLastBriefingDate(): Promise<string | null> {
    const { data } = await supabase
      .from("user_preferences")
      .select("preference_value")
      .eq("preference_key", LAST_BRIEFING_KEY)
      .maybeSingle();
    return (data?.preference_value as any)?.date ?? null;
  },

  async setLastBriefingDate(date: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from("user_preferences")
      .select("id")
      .eq("preference_key", LAST_BRIEFING_KEY)
      .maybeSingle();

    const val = { date } as any;
    if (existing) {
      await supabase.from("user_preferences").update({ preference_value: val }).eq("id", existing.id);
    } else {
      await supabase.from("user_preferences").insert({ user_id: user.id, preference_key: LAST_BRIEFING_KEY, preference_value: val });
    }
  },

  async runBriefing(): Promise<any> {
    const { data, error } = await supabase.functions.invoke("plan-ai-secretary", {
      body: { action: "briefing" },
    });
    if (error) throw error;
    return data;
  },

  async runPreMeetingPrep(meetingId: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke("plan-ai-secretary", {
      body: { action: "prep", meetingId },
    });
    if (error) throw error;
    return data;
  },

  async runEodReview(date: string): Promise<any> {
    const { data, error } = await supabase.functions.invoke("plan-ai-secretary", {
      body: { action: "eod", date },
    });
    if (error) throw error;
    return data;
  },
};
