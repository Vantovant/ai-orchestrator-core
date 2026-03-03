import { supabase } from "@/integrations/supabase/client";

export interface ActivityLogEntry {
  id: string;
  project_id: string;
  actor_id: string;
  event_type: string;
  payload: any;
  created_at: string;
}

export const activityLogService = {
  async list(projectId: string, limit = 50) {
    const { data, error } = await supabase
      .from("activity_log" as any)
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as unknown as ActivityLogEntry[];
  },

  async log(projectId: string, eventType: string, payload: any = {}) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("activity_log" as any)
      .insert({ project_id: projectId, actor_id: user.id, event_type: eventType, payload } as any);
  },
};
