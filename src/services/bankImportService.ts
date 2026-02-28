import { supabase } from "@/integrations/supabase/client";

// ── Types ──

export interface BankAccount {
  id: string;
  user_id: string;
  bank_name: string;
  account_name: string;
  currency: string;
  last4: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BankStatementImport {
  id: string;
  user_id: string;
  bank_account_id: string;
  file_path: string;
  file_type: string;
  imported_at: string;
  status: string;
  stats_json: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BankTransaction {
  id: string;
  user_id: string;
  bank_account_id: string;
  import_id: string;
  txn_date: string;
  description: string;
  reference: string | null;
  amount: number;
  balance: number | null;
  fingerprint_hash: string;
  category: string | null;
  merchant: string | null;
  finance_entry_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MerchantRule {
  id: string;
  user_id: string;
  pattern: string;
  category: string;
  priority: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// ── SA Merchant Categorization Rules ──

const SA_CATEGORY_RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /checkers|shoprite|woolworths|pick.?n.?pay|spar|food.?lover/i, category: "groceries" },
  { pattern: /engen|shell|caltex|sasol|bp|total.?energ/i, category: "fuel" },
  { pattern: /vodacom|mtn|cell.?c|telkom|rain|afrihost|fibre/i, category: "telco" },
  { pattern: /bank.?fee|monthly.?fee|service.?fee|admin.?fee|card.?fee|transaction.?fee/i, category: "bank_fees" },
  { pattern: /uber|bolt|taxi|e-?toll|sanral|gautrain/i, category: "transport" },
  { pattern: /old.?mutual|sanlam|discovery|outsurance|momentum|hollard|miway/i, category: "insurance" },
  { pattern: /medic|pharm|dis-?chem|clicks|doctor|hospital|bonitas|gems/i, category: "medical" },
  { pattern: /municipal|rates|water|electric|eskom|city.?of|prepaid.?elec/i, category: "municipal" },
  { pattern: /sars|tax.?payment|provisional|paye/i, category: "tax" },
  { pattern: /netflix|spotify|showmax|dstv|multichoice|youtube|apple|google.?play/i, category: "subscriptions" },
  { pattern: /rent|lease|bond|mortgage|home.?loan/i, category: "rent" },
  { pattern: /school|university|college|tuition|unisa/i, category: "education" },
  { pattern: /kfc|mcdonald|nando|steers|burger|pizza|debonairs|wimpy/i, category: "dining" },
  { pattern: /atm|cash.?withdrawal/i, category: "cash_withdrawal" },
  { pattern: /salary|wages|payroll|remuneration/i, category: "salary" },
];

// ── Transfer/Internal Movement Detector ──

const TRANSFER_PATTERNS: RegExp[] = [
  /transfer\s*(to|from|between)/i,
  /inter.?account/i,
  /own.?account/i,
  /intra.?bank/i,
  /tfr\s*(to|from|fr)/i,
  /payment\s*to\s*self/i,
  /savings.?transfer/i,
  /immediate.?transfer/i,
  /ibt\b/i,
];

export function isLikelyTransfer(description: string): boolean {
  return TRANSFER_PATTERNS.some(p => p.test(description));
}

// ── SA Compliance Pattern Detectors ──

const SA_COMPLIANCE_PATTERNS = {
  sars: /sars|south.?african.?revenue/i,
  paye: /paye|pay.?as.?you.?earn/i,
  uif: /uif|unemployment.?insurance/i,
  vat: /vat|value.?added.?tax/i,
  provisional_tax: /provisional.?tax/i,
};

export interface ComplianceFlags {
  sarsTxns: number;
  payeTxns: number;
  uifTxns: number;
  vatTxns: number;
  provisionalTaxTxns: number;
  sarsTotalAmount: number;
  payeTotalAmount: number;
  uifTotalAmount: number;
  missingVatIndicator: boolean; // true if business income but no VAT detected
  missingUifIndicator: boolean; // true if salary detected but no UIF
}

export function detectComplianceFlags(txns: BankTransaction[], hasBusinessIncome: boolean): ComplianceFlags {
  let sarsTxns = 0, payeTxns = 0, uifTxns = 0, vatTxns = 0, provisionalTaxTxns = 0;
  let sarsTotalAmount = 0, payeTotalAmount = 0, uifTotalAmount = 0;
  let hasSalary = false;

  for (const t of txns) {
    const d = t.description;
    if (SA_COMPLIANCE_PATTERNS.sars.test(d)) { sarsTxns++; sarsTotalAmount += Math.abs(t.amount); }
    if (SA_COMPLIANCE_PATTERNS.paye.test(d)) { payeTxns++; payeTotalAmount += Math.abs(t.amount); }
    if (SA_COMPLIANCE_PATTERNS.uif.test(d)) { uifTxns++; uifTotalAmount += Math.abs(t.amount); }
    if (SA_COMPLIANCE_PATTERNS.vat.test(d)) { vatTxns++; }
    if (SA_COMPLIANCE_PATTERNS.provisional_tax.test(d)) { provisionalTaxTxns++; }
    if (t.category === "salary" || /salary|wages/i.test(d)) hasSalary = true;
  }

  return {
    sarsTxns, payeTxns, uifTxns, vatTxns, provisionalTaxTxns,
    sarsTotalAmount, payeTotalAmount, uifTotalAmount,
    missingVatIndicator: hasBusinessIncome && vatTxns === 0,
    missingUifIndicator: hasSalary && uifTxns === 0,
  };
}

export function categorizeTransaction(description: string, userRules: MerchantRule[] = []): string | null {
  const desc = description.toLowerCase();
  for (const rule of userRules.sort((a, b) => b.priority - a.priority)) {
    if (desc.includes(rule.pattern.toLowerCase())) return rule.category;
  }
  for (const rule of SA_CATEGORY_RULES) {
    if (rule.pattern.test(desc)) return rule.category;
  }
  // Auto-detect transfers
  if (isLikelyTransfer(description)) return "transfer";
  return null;
}

export function extractMerchant(description: string): string {
  const cleaned = description
    .replace(/\d{4}[-/]\d{2}[-/]\d{2}/g, "")
    .replace(/\d{10,}/g, "")
    .replace(/[*#]+/g, "")
    .trim();
  const tokens = cleaned.split(/\s+/).slice(0, 3).join(" ");
  return tokens || description.slice(0, 30);
}

// ── SA Bank CSV Presets ──

export interface CsvColumnMapping {
  date: number;
  description: number;
  debit?: number;
  credit?: number;
  amount?: number;
  balance?: number;
  reference?: number;
}

export const SA_BANK_PRESETS: Record<string, { name: string; mapping: CsvColumnMapping; dateFormat: string; skipRows: number }> = {
  fnb: { name: "FNB", mapping: { date: 0, description: 2, amount: 1, balance: 3 }, dateFormat: "YYYY/MM/DD", skipRows: 1 },
  standard_bank: { name: "Standard Bank", mapping: { date: 0, description: 1, debit: 2, credit: 3, balance: 4 }, dateFormat: "YYYY/MM/DD", skipRows: 1 },
  absa: { name: "Absa", mapping: { date: 0, description: 3, amount: 4, balance: 5 }, dateFormat: "YYYY-MM-DD", skipRows: 1 },
  nedbank: { name: "Nedbank", mapping: { date: 0, description: 1, amount: 2, balance: 3 }, dateFormat: "YYYY/MM/DD", skipRows: 1 },
  capitec: { name: "Capitec", mapping: { date: 0, description: 1, debit: 2, credit: 3, balance: 4 }, dateFormat: "YYYY/MM/DD", skipRows: 1 },
  tymebank: { name: "TymeBank", mapping: { date: 0, description: 1, amount: 2, balance: 3 }, dateFormat: "YYYY-MM-DD", skipRows: 1 },
};

// ── Bank Account Service ──

export const bankAccountService = {
  async list() {
    const { data, error } = await supabase
      .from("bank_accounts")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data as BankAccount[];
  },

  async create(account: Pick<BankAccount, "bank_name" | "account_name"> & Partial<Pick<BankAccount, "currency" | "last4">>) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("bank_accounts")
      .insert({ ...account, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data as BankAccount;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("bank_accounts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};

// ── Import Service ──

export const bankImportService = {
  async list(bankAccountId?: string) {
    let query = supabase
      .from("bank_statement_imports")
      .select("*")
      .is("deleted_at", null)
      .order("imported_at", { ascending: false });
    if (bankAccountId) query = query.eq("bank_account_id", bankAccountId);
    const { data, error } = await query;
    if (error) throw error;
    return data as BankStatementImport[];
  },

  async create(bankAccountId: string, filePath: string, fileType: string) {
    const userId = await getUserId();
    const { data, error } = await supabase
      .from("bank_statement_imports")
      .insert({ user_id: userId, bank_account_id: bankAccountId, file_path: filePath, file_type: fileType })
      .select()
      .single();
    if (error) throw error;
    return data as BankStatementImport;
  },

  async updateStatus(id: string, status: string, statsJson?: any, errorMessage?: string | null) {
    const updates: any = { status };
    if (statsJson !== undefined) updates.stats_json = statsJson;
    if (errorMessage !== undefined) updates.error_message = errorMessage;
    const { data, error } = await supabase
      .from("bank_statement_imports")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as BankStatementImport;
  },

  async uploadFile(userId: string, importId: string, file: File) {
    const ext = file.name.split(".").pop() || "csv";
    const path = `${userId}/${importId}/original.${ext}`;
    const { error } = await supabase.storage.from("statements").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  },
};

// ── Transaction Service ──

export const bankTransactionService = {
  async listByImport(importId: string) {
    const { data, error } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("import_id", importId)
      .is("deleted_at", null)
      .order("txn_date", { ascending: false });
    if (error) throw error;
    return data as BankTransaction[];
  },

  async updateCategory(id: string, category: string) {
    const { data, error } = await supabase
      .from("bank_transactions")
      .update({ category })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as BankTransaction;
  },

  async markAsTransfer(id: string) {
    const { data, error } = await supabase
      .from("bank_transactions")
      .update({ category: "transfer" })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as BankTransaction;
  },

  async bulkMarkAsTransfer(ids: string[]) {
    const { error } = await supabase
      .from("bank_transactions")
      .update({ category: "transfer" })
      .in("id", ids);
    if (error) throw error;
  },

  async bulkUpdateCategory(ids: string[], category: string) {
    const { error } = await supabase
      .from("bank_transactions")
      .update({ category })
      .in("id", ids);
    if (error) throw error;
  },

  async excludeTransaction(id: string) {
    const { error } = await supabase
      .from("bank_transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  async commitToLedger(importId: string) {
    const userId = await getUserId();
    const { data: txns, error } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("import_id", importId)
      .is("deleted_at", null)
      .is("finance_entry_id", null);
    if (error) throw error;

    for (const txn of (txns ?? []) as BankTransaction[]) {
      // Skip transfers — they don't affect spending/income
      if (txn.category === "transfer") continue;

      const type = txn.amount >= 0 ? "income" : "expense";
      const { data: entry, error: entryErr } = await supabase
        .from("finance_entries")
        .insert({
          user_id: userId,
          type,
          category: txn.category || "uncategorized",
          amount: Math.abs(txn.amount),
          entry_date: txn.txn_date,
          source: "bank_statement",
          notes: `${txn.description}${txn.reference ? ` | Ref: ${txn.reference}` : ""}`,
        })
        .select("id")
        .single();
      if (entryErr) throw entryErr;

      await supabase
        .from("bank_transactions")
        .update({ finance_entry_id: entry!.id })
        .eq("id", txn.id);
    }

    // Mark transfer txns as committed too (without finance entry)
    await supabase
      .from("bank_transactions")
      .update({ finance_entry_id: "00000000-0000-0000-0000-000000000000" })
      .eq("import_id", importId)
      .eq("category", "transfer")
      .is("finance_entry_id", null)
      .is("deleted_at", null);

    await supabase
      .from("bank_statement_imports")
      .update({ status: "committed" })
      .eq("id", importId);
  },

  async getImportInsights(importId: string) {
    const { data, error } = await supabase
      .from("bank_transactions")
      .select("*")
      .eq("import_id", importId)
      .is("deleted_at", null);
    if (error) throw error;
    const txns = (data ?? []) as BankTransaction[];

    // Exclude transfers from spending analysis
    const nonTransferTxns = txns.filter(t => t.category !== "transfer");

    const totalCredit = nonTransferTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const totalDebit = nonTransferTxns.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

    const byCategory: Record<string, number> = {};
    nonTransferTxns.filter(t => t.amount < 0).forEach(t => {
      const cat = t.category || "uncategorized";
      byCategory[cat] = (byCategory[cat] || 0) + Math.abs(t.amount);
    });

    const topMerchants: Record<string, number> = {};
    nonTransferTxns.filter(t => t.amount < 0).forEach(t => {
      const m = t.merchant || t.description.slice(0, 20);
      topMerchants[m] = (topMerchants[m] || 0) + Math.abs(t.amount);
    });

    const bankFees = txns.filter(t => t.category === "bank_fees").reduce((s, t) => s + Math.abs(t.amount), 0);
    const subscriptions = txns.filter(t => t.category === "subscriptions").reduce((s, t) => s + Math.abs(t.amount), 0);

    const debitsByKey: Record<string, number> = {};
    nonTransferTxns.filter(t => t.amount < 0).forEach(t => {
      const key = `${t.merchant || t.description.slice(0, 15)}_${Math.abs(t.amount).toFixed(2)}`;
      debitsByKey[key] = (debitsByKey[key] || 0) + 1;
    });
    const recurringDebits = Object.entries(debitsByKey).filter(([, count]) => count >= 2);

    // Transfer stats
    const transferTxns = txns.filter(t => t.category === "transfer");
    const detectedTransfers = txns.filter(t => isLikelyTransfer(t.description) && t.category !== "transfer");

    // Compliance flags
    const hasBusinessIncome = nonTransferTxns.some(t => t.amount > 0 && t.category === "business");
    const compliance = detectComplianceFlags(txns, hasBusinessIncome);

    return {
      totalCredit,
      totalDebit,
      net: totalCredit - totalDebit,
      rowCount: txns.length,
      duplicatesSkipped: 0,
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1]),
      topMerchants: Object.entries(topMerchants).sort((a, b) => b[1] - a[1]).slice(0, 10),
      bankFees,
      subscriptions,
      recurringDebits: recurringDebits.length,
      transferCount: transferTxns.length,
      detectedTransferCount: detectedTransfers.length,
      compliance,
    };
  },

  /** AI-assisted categorization (privacy-safe: only merchant + amount bucket + candidates) */
  async aiCategorizeBatch(importId: string) {
    const { data: txns, error } = await supabase
      .from("bank_transactions")
      .select("id, merchant, amount, category")
      .eq("import_id", importId)
      .is("deleted_at", null)
      .is("category", null);
    if (error) throw error;
    if (!txns || txns.length === 0) return { categorized: 0 };

    // Build privacy-safe payload: merchant + amount bucket only
    const items = (txns as any[]).map(t => ({
      id: t.id,
      merchant: t.merchant || "unknown",
      amount_bucket: Math.abs(t.amount) < 50 ? "small" : Math.abs(t.amount) < 500 ? "medium" : Math.abs(t.amount) < 5000 ? "large" : "very_large",
      direction: t.amount >= 0 ? "credit" : "debit",
    }));

    const { data, error: fnErr } = await supabase.functions.invoke("bank-categorize-ai", {
      body: { items },
    });
    if (fnErr) throw fnErr;

    const results = data?.results || [];
    let categorized = 0;
    for (const r of results) {
      if (r.id && r.category) {
        await supabase.from("bank_transactions").update({ category: r.category }).eq("id", r.id);
        categorized++;
      }
    }
    return { categorized };
  },
};

// ── Merchant Rules Service ──

export const merchantRuleService = {
  async list() {
    const { data, error } = await supabase
      .from("merchant_rules")
      .select("*")
      .is("deleted_at", null)
      .order("priority", { ascending: false });
    if (error) throw error;
    return data as MerchantRule[];
  },

  async create(pattern: string, category: string) {
    const userId = await getUserId();
    // Check if rule already exists
    const { data: existing } = await supabase
      .from("merchant_rules")
      .select("id")
      .eq("pattern", pattern)
      .is("deleted_at", null)
      .limit(1);
    if (existing && existing.length > 0) {
      // Update existing
      const { data, error } = await supabase
        .from("merchant_rules")
        .update({ category, priority: 10 })
        .eq("id", existing[0].id)
        .select()
        .single();
      if (error) throw error;
      return data as MerchantRule;
    }
    const { data, error } = await supabase
      .from("merchant_rules")
      .insert({ user_id: userId, pattern, category, priority: 10 })
      .select()
      .single();
    if (error) throw error;
    return data as MerchantRule;
  },

  async softDelete(id: string) {
    const { error } = await supabase
      .from("merchant_rules")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};