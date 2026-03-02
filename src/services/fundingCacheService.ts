import { supabase } from "@/integrations/supabase/client";

export interface FundingEntry {
  id: string;
  user_id: string;
  project_id: string | null;
  region: string;
  org_name: string;
  program_name: string;
  funding_type: string;
  ticket_size_range: string | null;
  eligibility: string | null;
  summary: string;
  source_url: string;
  source_name: string | null;
  fetched_at: string;
  expires_at: string | null;
  created_at: string;
}

export const fundingCacheService = {
  async listForProject(projectId: string): Promise<FundingEntry[]> {
    const { data } = await supabase
      .from("funding_cache" as any)
      .select("*")
      .eq("project_id", projectId)
      .order("fetched_at", { ascending: false });
    return (data as any) ?? [];
  },

  async listForRegion(region: string): Promise<FundingEntry[]> {
    const { data } = await supabase
      .from("funding_cache" as any)
      .select("*")
      .eq("region", region)
      .order("fetched_at", { ascending: false });
    return (data as any) ?? [];
  },

  async deleteEntry(id: string): Promise<void> {
    await supabase.from("funding_cache" as any).delete().eq("id", id);
  },
};
