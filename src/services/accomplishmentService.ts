import { supabase } from "@/integrations/supabase/client";

export interface Accomplishment {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  category: string;
  details: string | null;
  happened_at: string;
  link_url: string | null;
  created_at: string;
}

export type AccomplishmentInsert = Pick<Accomplishment, "project_id" | "title"> &
  Partial<Pick<Accomplishment, "category" | "details" | "happened_at" | "link_url">>;

export const accomplishmentService = {
  async list(projectId: string) {
    const { data, error } = await supabase
      .from("project_accomplishments" as any)
      .select("*")
      .eq("project_id", projectId)
      .order("happened_at", { ascending: false });
    if (error) throw error;
    return data as unknown as Accomplishment[];
  },

  async create(input: AccomplishmentInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("project_accomplishments" as any)
      .insert({ ...input, user_id: user.id } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Accomplishment;
  },

  async remove(id: string) {
    const { error } = await supabase
      .from("project_accomplishments" as any)
      .delete()
      .eq("id", id);
    if (error) throw error;
  },
};
