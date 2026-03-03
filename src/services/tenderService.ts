import { supabase } from "@/integrations/supabase/client";

export interface Tender {
  id: string;
  user_id: string;
  project_id: string;
  entity: string;
  ref_no: string;
  closing_at: string | null;
  briefing_required: boolean;
  submission_method: string;
  contact: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TenderRequirement {
  id: string;
  user_id: string;
  tender_id: string;
  requirement: string;
  mandatory: boolean;
  source_section: string | null;
  status: string;
  created_at: string;
}

export interface TenderComplianceItem {
  id: string;
  user_id: string;
  tender_id: string;
  item_name: string;
  required: boolean;
  doc_id: string | null;
  expires_at: string | null;
  status: string;
  created_at: string;
}

export interface TenderPricing {
  id: string;
  user_id: string;
  tender_id: string;
  pricing_csv_url: string | null;
  assumptions_json: any[];
  margin_pct: number;
  cashflow_impact_json: any;
  created_at: string;
  updated_at: string;
}

export interface TenderProposal {
  id: string;
  user_id: string;
  tender_id: string;
  exec_summary: string;
  methodology: string;
  team: string;
  experience: string;
  qa_plan: string;
  risk_mitigation: string;
  created_at: string;
  updated_at: string;
}

export interface TenderSubmission {
  id: string;
  user_id: string;
  tender_id: string;
  submitted_at: string;
  method: string;
  proof_url: string | null;
  created_at: string;
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

export const tenderService = {
  async get(projectId: string) {
    const { data, error } = await supabase
      .from("tenders" as any)
      .select("*")
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as Tender | null;
  },

  async upsert(projectId: string, updates: Partial<Tender>) {
    const userId = await getUserId();
    const existing = await this.get(projectId);
    if (existing) {
      const { data, error } = await supabase
        .from("tenders" as any)
        .update(updates as any)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Tender;
    } else {
      const { data, error } = await supabase
        .from("tenders" as any)
        .insert({ project_id: projectId, user_id: userId, ...updates } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Tender;
    }
  },
};

export const tenderRequirementsService = {
  async list(tenderId: string) {
    const { data, error } = await supabase
      .from("tender_requirements" as any)
      .select("*")
      .eq("tender_id", tenderId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data as unknown as TenderRequirement[];
  },

  async create(tenderId: string, requirement: string, mandatory = true, sourceSection?: string) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("tender_requirements" as any)
      .insert({ tender_id: tenderId, user_id: userId, requirement, mandatory, source_section: sourceSection } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TenderRequirement;
  },

  async update(id: string, updates: Partial<TenderRequirement>) {
    const { data, error } = await supabase
      .from("tender_requirements" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TenderRequirement;
  },
};

export const tenderComplianceService = {
  async list(tenderId: string) {
    const { data, error } = await supabase
      .from("tender_compliance_items" as any)
      .select("*")
      .eq("tender_id", tenderId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data as unknown as TenderComplianceItem[];
  },

  async create(tenderId: string, itemName: string, required = true) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("tender_compliance_items" as any)
      .insert({ tender_id: tenderId, user_id: userId, item_name: itemName, required } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TenderComplianceItem;
  },

  async update(id: string, updates: Partial<TenderComplianceItem>) {
    const { data, error } = await supabase
      .from("tender_compliance_items" as any)
      .update(updates as any)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TenderComplianceItem;
  },
};

export const tenderPricingService = {
  async get(tenderId: string) {
    const { data, error } = await supabase
      .from("tender_pricing" as any)
      .select("*")
      .eq("tender_id", tenderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as TenderPricing | null;
  },

  async upsert(tenderId: string, updates: Partial<TenderPricing>) {
    const userId = await getUserId();
    const existing = await this.get(tenderId);
    if (existing) {
      const { data, error } = await supabase
        .from("tender_pricing" as any)
        .update(updates as any)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TenderPricing;
    } else {
      const { data, error } = await supabase
        .from("tender_pricing" as any)
        .insert({ tender_id: tenderId, user_id: userId, ...updates } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TenderPricing;
    }
  },
};

export const tenderProposalService = {
  async get(tenderId: string) {
    const { data, error } = await supabase
      .from("tender_proposals" as any)
      .select("*")
      .eq("tender_id", tenderId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as TenderProposal | null;
  },

  async upsert(tenderId: string, updates: Partial<TenderProposal>) {
    const userId = await getUserId();
    const existing = await this.get(tenderId);
    if (existing) {
      const { data, error } = await supabase
        .from("tender_proposals" as any)
        .update(updates as any)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TenderProposal;
    } else {
      const { data, error } = await supabase
        .from("tender_proposals" as any)
        .insert({ tender_id: tenderId, user_id: userId, ...updates } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TenderProposal;
    }
  },
};

export const tenderSubmissionsService = {
  async list(tenderId: string) {
    const { data, error } = await supabase
      .from("tender_submissions" as any)
      .select("*")
      .eq("tender_id", tenderId)
      .is("deleted_at", null)
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    return data as unknown as TenderSubmission[];
  },

  async create(tenderId: string, method: string, proofUrl?: string) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("tender_submissions" as any)
      .insert({ tender_id: tenderId, user_id: userId, method, proof_url: proofUrl } as any)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as TenderSubmission;
  },
};

// ── Bid Readiness Score ──
export function computeBidReadiness(
  requirements: TenderRequirement[],
  compliance: TenderComplianceItem[],
  pricing: TenderPricing | null
): number {
  const mandatoryReqs = requirements.filter(r => r.mandatory);
  const metReqs = mandatoryReqs.filter(r => r.status === "met");
  const reqScore = mandatoryReqs.length > 0 ? (metReqs.length / mandatoryReqs.length) * 40 : 0;

  const requiredCompliance = compliance.filter(c => c.required);
  const attachedCompliance = requiredCompliance.filter(c => c.status === "uploaded" || c.doc_id);
  const compScore = requiredCompliance.length > 0 ? (attachedCompliance.length / requiredCompliance.length) * 40 : 0;

  const pricingScore = pricing?.pricing_csv_url ? 20 : 0;

  return Math.round(reqScore + compScore + pricingScore);
}
