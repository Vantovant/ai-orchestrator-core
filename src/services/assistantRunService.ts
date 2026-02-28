import { supabase } from "@/integrations/supabase/client";

export interface AssistantRun {
  id: string;
  user_id: string;
  snapshot_json: any;
  result_json: any;
  created_at: string;
}

export const assistantRunService = {
  async save(snapshot: any, result: any) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("assistant_runs")
      .insert({ user_id: user.id, snapshot_json: snapshot, result_json: result })
      .select()
      .single();
    if (error) throw error;
    return data as AssistantRun;
  },

  async getLatest() {
    const { data, error } = await supabase
      .from("assistant_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as AssistantRun | null;
  },
};
