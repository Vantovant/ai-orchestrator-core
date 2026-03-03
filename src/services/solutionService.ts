import { supabase } from "@/integrations/supabase/client";

// ── Types ──

export type SolutionType = "standard" | "funded_business" | "tender";

export interface BusinessCase {
  id: string;
  user_id: string;
  project_id: string;
  problem: string;
  customer: string;
  offer: string;
  model: string;
  risks_json: any[];
  created_at: string;
  updated_at: string;
}

export interface FinancialModel {
  id: string;
  user_id: string;
  project_id: string;
  currency: string;
  startup_costs_json: any[];
  monthly_costs_json: any[];
  pricing_json: any[];
  cashflow_json: any[];
  runway_months: number | null;
  funding_target_amount: number;
  assumptions_json: any[];
  created_at: string;
  updated_at: string;
}

export interface FundingPack {
  id: string;
  user_id: string;
  project_id: string;
  use_of_funds_json: any[];
  milestones_json: any[];
  ask_amount: number;
  deadline: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMilestone {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  due_date: string | null;
  status: string;
  evidence_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectDocument {
  id: string;
  user_id: string;
  project_id: string;
  doc_type: string;
  url: string;
  version: number;
  label: string;
  expires_at: string | null;
  created_at: string;
}

// ── Helpers ──

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// ── Business Case Service ──

export const businessCaseService = {
  async get(projectId: string) {
    const { data, error } = await supabase
      .from("business_cases" as any)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as BusinessCase | null;
  },

  async upsert(projectId: string, updates: Partial<BusinessCase>) {
    const userId = await getUserId();
    const existing = await this.get(projectId);
    if (existing) {
      const { data, error } = await supabase
        .from("business_cases" as any)
        .update(updates as any)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as BusinessCase;
    } else {
      const { data, error } = await supabase
        .from("business_cases" as any)
        .insert({ project_id: projectId, user_id: userId, ...updates } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as BusinessCase;
    }
  },
};

// ── Financial Model Service ──

export const financialModelService = {
  async get(projectId: string) {
    const { data, error } = await supabase
      .from("financial_models" as any)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as FinancialModel | null;
  },

  async upsert(projectId: string, updates: Partial<FinancialModel>) {
    const userId = await getUserId();
    const existing = await this.get(projectId);
    if (existing) {
      const { data, error } = await supabase
        .from("financial_models" as any)
        .update(updates as any)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FinancialModel;
    } else {
      const { data, error } = await supabase
        .from("financial_models" as any)
        .insert({ project_id: projectId, user_id: userId, ...updates } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FinancialModel;
    }
  },
};

// ── Funding Pack Service ──

export const fundingPackService = {
  async get(projectId: string) {
    const { data, error } = await supabase
      .from("funding_packs" as any)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as FundingPack | null;
  },

  async upsert(projectId: string, updates: Partial<FundingPack>) {
    const userId = await getUserId();
    const existing = await this.get(projectId);
    if (existing) {
      const { data, error } = await supabase
        .from("funding_packs" as any)
        .update(updates as any)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FundingPack;
    } else {
      const { data, error } = await supabase
        .from("funding_packs" as any)
        .insert({ project_id: projectId, user_id: userId, ...updates } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FundingPack;
    }
  },
};

// ── Milestones Service ──

export const milestonesService = {
  async list(projectId: string) {
    const { data, error } = await supabase
      .from("project_milestones" as any)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true });
    if (error) throw error;
    return data as unknown as ProjectMilestone[];
  },

  async create(projectId: string, title: string, dueDate?: string) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("project_milestones" as any)
      .insert({ project_id: projectId, user_id: userId, title, due_date: dueDate } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ProjectMilestone;
  },

  async update(id: string, updates: Partial<ProjectMilestone>) {
    const { data, error } = await supabase
      .from("project_milestones" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ProjectMilestone;
  },

  async remove(id: string) {
    await supabase
      .from("project_milestones" as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
  },
};

// ── Documents Service ──

export const projectDocumentsService = {
  async list(projectId: string) {
    const { data, error } = await supabase
      .from("project_documents" as any)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as unknown as ProjectDocument[];
  },

  async create(projectId: string, label: string, url: string, docType: string = "general") {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("project_documents" as any)
      .insert({ project_id: projectId, user_id: userId, label, url, doc_type: docType } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as ProjectDocument;
  },

  async remove(id: string) {
    await supabase
      .from("project_documents" as any)
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);
  },
};
