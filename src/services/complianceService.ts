import { supabase } from "@/integrations/supabase/client";

export interface ComplianceReminder {
  id: string;
  user_id: string;
  type: string;
  label: string;
  due_date: string;
  is_done: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type ComplianceReminderInsert = Pick<ComplianceReminder, "type" | "label" | "due_date"> & Partial<Pick<ComplianceReminder, "notes">>;

// SA compliance calendar defaults
export const SA_COMPLIANCE_PRESETS = [
  { type: "sars_provisional", label: "SARS Provisional Tax (1st period)", defaultMonth: 8, defaultDay: 31 },
  { type: "sars_provisional", label: "SARS Provisional Tax (2nd period)", defaultMonth: 2, defaultDay: 28 },
  { type: "vat_return", label: "VAT Return Submission", defaultMonth: null, defaultDay: 25 },
  { type: "paye", label: "PAYE Monthly Submission", defaultMonth: null, defaultDay: 7 },
  { type: "uif", label: "UIF Monthly Contribution", defaultMonth: null, defaultDay: 7 },
  { type: "annual_return", label: "CIPC Annual Return", defaultMonth: null, defaultDay: null },
];

export const complianceService = {
  async list() {
    const { data, error } = await supabase
      .from("compliance_reminders")
      .select("*")
      .is("deleted_at", null)
      .order("due_date", { ascending: true });
    if (error) throw error;
    return data as ComplianceReminder[];
  },

  async create(reminder: ComplianceReminderInsert) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");
    const { data, error } = await supabase
      .from("compliance_reminders")
      .insert({ ...reminder, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    return data as ComplianceReminder;
  },

  async toggleDone(id: string, is_done: boolean) {
    const { error } = await supabase
      .from("compliance_reminders")
      .update({ is_done })
      .eq("id", id);
    if (error) throw error;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("compliance_reminders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
