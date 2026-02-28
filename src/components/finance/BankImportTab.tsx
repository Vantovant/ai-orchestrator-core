import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  bankAccountService, bankImportService, bankTransactionService, merchantRuleService,
  SA_BANK_PRESETS, isLikelyTransfer,
  type BankAccount, type BankStatementImport, type BankTransaction, type CsvColumnMapping,
} from "@/services/bankImportService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Upload, Plus, FileSpreadsheet, CheckCircle, AlertTriangle, RefreshCw,
  Trash2, HelpCircle, ArrowRight, Download as DownloadIcon, ArrowLeftRight,
  Shield, Sparkles, BookmarkPlus,
} from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => `R ${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ALL_CATEGORIES = [
  "groceries", "fuel", "telco", "bank_fees", "transport", "insurance", "medical",
  "municipal", "tax", "subscriptions", "rent", "education", "dining", "cash_withdrawal",
  "salary", "business", "transfer", "uncategorized",
];

// ── Add Bank Account Dialog ──
function AddBankAccountDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [last4, setLast4] = useState("");

  const mut = useMutation({
    mutationFn: () => bankAccountService.create({ bank_name: bankName, account_name: accountName, last4: last4 || undefined }),
    onSuccess: () => { onCreated(); setOpen(false); setBankName(""); setAccountName(""); setLast4(""); toast.success("Bank account added"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Add Account</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Bank Account</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <Select value={bankName} onValueChange={setBankName}>
            <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
            <SelectContent>
              {["FNB", "Standard Bank", "Absa", "Nedbank", "Capitec", "TymeBank", "Other"].map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="Account name (e.g. Cheque, Savings)" value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
          <Input placeholder="Last 4 digits (optional)" value={last4} onChange={(e) => setLast4(e.target.value)} maxLength={4} />
          <Button type="submit" className="w-full" disabled={mut.isPending || !bankName}>{mut.isPending ? "Saving..." : "Add Account"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── CSV Column Mapping UI ──
function CsvMappingStep({ headers, sampleRows, onConfirm }: { headers: string[]; sampleRows: string[][]; onConfirm: (mapping: CsvColumnMapping, skipRows: number) => void }) {
  const [preset, setPreset] = useState("");
  const [dateCol, setDateCol] = useState<number | undefined>(undefined);
  const [descCol, setDescCol] = useState<number | undefined>(undefined);
  const [debitCol, setDebitCol] = useState<number | undefined>(undefined);
  const [creditCol, setCreditCol] = useState<number | undefined>(undefined);
  const [amountCol, setAmountCol] = useState<number | undefined>(undefined);
  const [balanceCol, setBalanceCol] = useState<number | undefined>(undefined);
  const [refCol, setRefCol] = useState<number | undefined>(undefined);

  const applyPreset = (key: string) => {
    setPreset(key);
    const p = SA_BANK_PRESETS[key];
    if (!p) return;
    setDateCol(p.mapping.date);
    setDescCol(p.mapping.description);
    setDebitCol(p.mapping.debit);
    setCreditCol(p.mapping.credit);
    setAmountCol(p.mapping.amount);
    setBalanceCol(p.mapping.balance);
    setRefCol(p.mapping.reference);
  };

  const canConfirm = dateCol !== undefined && descCol !== undefined && (amountCol !== undefined || (debitCol !== undefined));

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Map CSV Columns</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Bank Preset</label>
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger><SelectValue placeholder="Select your bank (or map manually)" /></SelectTrigger>
            <SelectContent>
              {Object.entries(SA_BANK_PRESETS).map(([k, v]) => <SelectItem key={k} value={k}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Date *", value: dateCol, setter: setDateCol },
            { label: "Description *", value: descCol, setter: setDescCol },
            { label: "Amount", value: amountCol, setter: setAmountCol },
            { label: "Debit", value: debitCol, setter: setDebitCol },
            { label: "Credit", value: creditCol, setter: setCreditCol },
            { label: "Balance", value: balanceCol, setter: setBalanceCol },
            { label: "Reference", value: refCol, setter: setRefCol },
          ].map(({ label, value, setter }) => (
            <div key={label}>
              <label className="text-xs text-muted-foreground">{label}</label>
              <Select value={value !== undefined ? String(value) : ""} onValueChange={(v) => setter(v ? parseInt(v) : undefined)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {headers.map((h, i) => <SelectItem key={i} value={String(i)}>{h || `Col ${i + 1}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {sampleRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr>{headers.map((h, i) => <th key={i} className="border border-border px-2 py-1 bg-muted text-left">{h || `Col ${i + 1}`}</th>)}</tr>
              </thead>
              <tbody>
                {sampleRows.slice(0, 3).map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="border border-border px-2 py-1">{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Button disabled={!canConfirm} onClick={() => onConfirm({
          date: dateCol!, description: descCol!, debit: debitCol, credit: creditCol, amount: amountCol, balance: balanceCol, reference: refCol,
        }, 1)} className="w-full gap-2">
          <ArrowRight className="h-4 w-4" /> Parse Statement
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Save Rule Prompt ──
function SaveRulePrompt({ merchant, category, onSave, onDismiss }: {
  merchant: string; category: string; onSave: () => void; onDismiss: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-accent/50 border border-accent text-xs animate-in fade-in slide-in-from-top-1">
      <BookmarkPlus className="h-3.5 w-3.5 text-primary flex-shrink-0" />
      <span className="flex-1">
        Always categorize "<span className="font-semibold">{merchant}</span>" as <span className="font-semibold capitalize">{category.replace(/_/g, " ")}</span>?
      </span>
      <Button size="sm" variant="default" className="h-6 text-xs px-2" onClick={onSave}>Save Rule</Button>
      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDismiss}>Dismiss</Button>
    </div>
  );
}

// ── Review Screen ──
function ReviewScreen({ importRec, onCommitted }: { importRec: BankStatementImport; onCommitted: () => void }) {
  const qc = useQueryClient();
  const txns = useQuery({ queryKey: ["bank_txns", importRec.id], queryFn: () => bankTransactionService.listByImport(importRec.id) });
  const insights = useQuery({ queryKey: ["bank_insights", importRec.id], queryFn: () => bankTransactionService.getImportInsights(importRec.id) });

  const [rulePrompt, setRulePrompt] = useState<{ id: string; merchant: string; category: string } | null>(null);
  const [aiAssistEnabled, setAiAssistEnabled] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["bank_txns", importRec.id] });
    qc.invalidateQueries({ queryKey: ["bank_insights", importRec.id] });
  };

  const commitMut = useMutation({
    mutationFn: () => bankTransactionService.commitToLedger(importRec.id),
    onSuccess: () => { onCommitted(); toast.success("Transactions committed to ledger"); },
    onError: (e: any) => toast.error(e.message),
  });

  const excludeMut = useMutation({
    mutationFn: bankTransactionService.excludeTransaction,
    onSuccess: invalidateAll,
  });

  const markTransferMut = useMutation({
    mutationFn: bankTransactionService.markAsTransfer,
    onSuccess: () => { invalidateAll(); toast.success("Marked as transfer — excluded from spending"); },
  });

  const updateCatMut = useMutation({
    mutationFn: ({ id, category, merchant }: { id: string; category: string; merchant?: string | null }) => {
      return bankTransactionService.updateCategory(id, category).then(result => {
        // Show save rule prompt when user overrides category on a transaction with a merchant
        if (merchant) {
          setRulePrompt({ id, merchant, category });
        }
        return result;
      });
    },
    onSuccess: invalidateAll,
  });

  const saveRuleMut = useMutation({
    mutationFn: ({ pattern, category }: { pattern: string; category: string }) => merchantRuleService.create(pattern, category),
    onSuccess: () => { toast.success("Rule saved — will auto-apply on future imports"); setRulePrompt(null); },
  });

  const bulkMarkTransferMut = useMutation({
    mutationFn: async () => {
      const detectedIds = (txns.data ?? [])
        .filter(t => isLikelyTransfer(t.description) && t.category !== "transfer")
        .map(t => t.id);
      if (detectedIds.length === 0) { toast.info("No transfers detected"); return; }
      await bankTransactionService.bulkMarkAsTransfer(detectedIds);
    },
    onSuccess: () => { invalidateAll(); toast.success("All detected transfers marked"); },
  });

  const handleAiAssist = async () => {
    setAiRunning(true);
    try {
      const result = await bankTransactionService.aiCategorizeBatch(importRec.id);
      toast.success(`AI categorized ${result.categorized} transactions`);
      invalidateAll();
    } catch (e: any) {
      toast.error(e.message || "AI categorization failed");
    } finally {
      setAiRunning(false);
    }
  };

  const stats = importRec.stats_json as any;
  const compliance = insights.data?.compliance;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Rows</p><p className="text-lg font-bold">{stats?.row_count ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Credits</p><p className="text-lg font-bold text-success">{fmt(stats?.credit_total ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Debits</p><p className="text-lg font-bold text-destructive">{fmt(stats?.debit_total ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">Duplicates Skipped</p><p className="text-lg font-bold">{stats?.duplicates_skipped ?? 0}</p></CardContent></Card>
      </div>

      {/* SA Insights + Compliance */}
      {insights.data && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {insights.data.bankFees > 0 && (
            <Card className="border-warning/30"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Bank Fees</p><p className="text-sm font-bold text-warning">{fmt(insights.data.bankFees)}</p></CardContent></Card>
          )}
          {insights.data.subscriptions > 0 && (
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Subscriptions</p><p className="text-sm font-bold">{fmt(insights.data.subscriptions)}</p></CardContent></Card>
          )}
          {insights.data.recurringDebits > 0 && (
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Recurring Debits</p><p className="text-sm font-bold">{insights.data.recurringDebits} detected</p></CardContent></Card>
          )}
          {insights.data.transferCount > 0 && (
            <Card className="border-primary/20"><CardContent className="p-3"><p className="text-xs text-muted-foreground flex items-center gap-1"><ArrowLeftRight className="h-3 w-3" /> Transfers</p><p className="text-sm font-bold">{insights.data.transferCount} excluded</p></CardContent></Card>
          )}
          {insights.data.byCategory.slice(0, 3).map(([cat, amt]) => (
            <Card key={cat}><CardContent className="p-3"><p className="text-xs text-muted-foreground capitalize">{cat.replace(/_/g, " ")}</p><p className="text-sm font-bold">{fmt(amt as number)}</p></CardContent></Card>
          ))}
        </div>
      )}

      {/* SA Compliance Flags */}
      {compliance && (compliance.sarsTxns > 0 || compliance.payeTxns > 0 || compliance.uifTxns > 0 || compliance.missingVatIndicator || compliance.missingUifIndicator) && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> SA Compliance Flags</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {compliance.sarsTxns > 0 && (
              <div className="flex justify-between items-center"><span>🏛️ SARS payments detected</span><span className="font-semibold">{compliance.sarsTxns} txns · {fmt(compliance.sarsTotalAmount)}</span></div>
            )}
            {compliance.payeTxns > 0 && (
              <div className="flex justify-between items-center"><span>💼 PAYE deductions detected</span><span className="font-semibold">{compliance.payeTxns} txns · {fmt(compliance.payeTotalAmount)}</span></div>
            )}
            {compliance.uifTxns > 0 && (
              <div className="flex justify-between items-center"><span>🛡️ UIF contributions detected</span><span className="font-semibold">{compliance.uifTxns} txns · {fmt(compliance.uifTotalAmount)}</span></div>
            )}
            {compliance.missingVatIndicator && (
              <div className="flex items-center gap-2 text-warning"><AlertTriangle className="h-3.5 w-3.5" /><span>Business income detected but no VAT payments found — check if VAT registration is needed (threshold: R1M/year)</span></div>
            )}
            {compliance.missingUifIndicator && (
              <div className="flex items-center gap-2 text-warning"><AlertTriangle className="h-3.5 w-3.5" /><span>Salary income detected but no UIF contributions found — verify UIF compliance</span></div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transfer detection + AI Assist toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {insights.data && insights.data.detectedTransferCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => bulkMarkTransferMut.mutate()} disabled={bulkMarkTransferMut.isPending}>
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Mark {insights.data.detectedTransferCount} detected transfer{insights.data.detectedTransferCount > 1 ? "s" : ""}
          </Button>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
            <Sparkles className="h-3.5 w-3.5" />
            AI Assist
            <Switch checked={aiAssistEnabled} onCheckedChange={setAiAssistEnabled} className="scale-75" />
          </label>
          {aiAssistEnabled && (
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs" onClick={handleAiAssist} disabled={aiRunning}>
              {aiRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiRunning ? "Categorizing…" : "Auto-categorize uncategorized"}
            </Button>
          )}
        </div>
      </div>

      {/* Save rule prompt */}
      {rulePrompt && (
        <SaveRulePrompt
          merchant={rulePrompt.merchant}
          category={rulePrompt.category}
          onSave={() => saveRuleMut.mutate({ pattern: rulePrompt.merchant, category: rulePrompt.category })}
          onDismiss={() => setRulePrompt(null)}
        />
      )}

      {/* Transaction list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Transactions ({txns.data?.length ?? 0})</CardTitle>
          <Button onClick={() => commitMut.mutate()} disabled={commitMut.isPending || !txns.data?.length} className="gap-2">
            {commitMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Commit to Ledger
          </Button>
        </CardHeader>
        <CardContent>
          {txns.isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {(txns.data ?? []).map(t => {
                const isTransfer = t.category === "transfer";
                const looksLikeTransfer = isLikelyTransfer(t.description) && !isTransfer;
                return (
                  <div key={t.id} className={`flex items-center justify-between rounded border p-2 text-sm gap-2 ${isTransfer ? "border-primary/20 bg-primary/5 opacity-70" : looksLikeTransfer ? "border-warning/30" : "border-border"}`}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{t.txn_date}</span>
                      <span className="truncate">{t.merchant || t.description}</span>
                      {isTransfer && <Badge variant="outline" className="text-[10px] h-4">Transfer</Badge>}
                      {looksLikeTransfer && <Badge variant="secondary" className="text-[10px] h-4">Transfer?</Badge>}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Select value={t.category || ""} onValueChange={(v) => updateCatMut.mutate({ id: t.id, category: v, merchant: t.merchant })}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          {ALL_CATEGORIES.map(c => (
                            <SelectItem key={c} value={c} className="text-xs capitalize">{c.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className={`text-xs font-semibold w-24 text-right ${t.amount >= 0 ? "text-success" : "text-destructive"}`}>
                        {t.amount >= 0 ? "+" : "-"}{fmt(t.amount)}
                      </span>
                      {looksLikeTransfer && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" title="Mark as transfer" onClick={() => markTransferMut.mutate(t.id)}>
                          <ArrowLeftRight className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => excludeMut.mutate(t.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Help Modal ──
function ExportHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><HelpCircle className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>How to Export Your Bank Statement</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">General steps:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Log in to your bank's internet banking or mobile app</li>
            <li>Navigate to your account statement or transaction history</li>
            <li>Select the date range you want to export</li>
            <li>Look for "Download", "Export", or "Save as" option</li>
            <li>Choose <strong>CSV</strong> format (preferred), OFX/QIF, or PDF</li>
            <li>Save the file and upload it here</li>
          </ol>
          <p className="text-xs mt-3">💡 <strong>Tip:</strong> CSV is the most reliable format. Most SA banks (FNB, Standard Bank, Absa, Nedbank, Capitec) support CSV export from their internet banking portals.</p>
          <p className="text-xs">📄 <strong>PDF (Beta):</strong> PDF statements are parsed using AI text extraction. Results may vary — review transactions carefully before committing.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Import Tab ──
export default function BankImportTab() {
  const qc = useQueryClient();
  const accounts = useQuery({ queryKey: ["bank_accounts"], queryFn: bankAccountService.list });
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [activeImport, setActiveImport] = useState<BankStatementImport | null>(null);
  const [mappingData, setMappingData] = useState<{ headers: string[]; sample_rows: string[][] } | null>(null);

  const imports = useQuery({
    queryKey: ["bank_imports", selectedAccountId],
    queryFn: () => bankImportService.list(selectedAccountId || undefined),
    enabled: true,
  });

  const handleUpload = async (file: File) => {
    if (!selectedAccountId) { toast.error("Select a bank account first"); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = file.name.split(".").pop()?.toLowerCase() || "csv";
      const fileType = ["ofx", "qif"].includes(ext) ? ext : "csv";

      const importRec = await bankImportService.create(selectedAccountId, "", fileType);
      const filePath = await bankImportService.uploadFile(user.id, importRec.id, file);

      await bankImportService.updateStatus(importRec.id, "uploaded", undefined, undefined);
      await supabase.from("bank_statement_imports").update({ file_path: filePath }).eq("id", importRec.id);

      const account = (accounts.data ?? []).find(a => a.id === selectedAccountId);
      const presetKey = account ? Object.entries(SA_BANK_PRESETS).find(([, v]) => v.name.toLowerCase() === account.bank_name.toLowerCase())?.[0] : undefined;

      if (presetKey) {
        await parseImport(importRec.id, SA_BANK_PRESETS[presetKey].mapping, SA_BANK_PRESETS[presetKey].skipRows || 1);
      } else {
        setParsing(true);
        const { data, error } = await supabase.functions.invoke("bank-import-parse", {
          body: { import_id: importRec.id },
        });
        setParsing(false);
        if (data?.status === "needs_mapping") {
          setMappingData({ headers: data.headers, sample_rows: data.sample_rows });
          setActiveImport({ ...importRec, id: importRec.id } as BankStatementImport);
        } else if (error) {
          throw error;
        }
      }

      qc.invalidateQueries({ queryKey: ["bank_imports"] });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const parseImport = async (importId: string, mapping: CsvColumnMapping, skipRows: number) => {
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke("bank-import-parse", {
        body: { import_id: importId, mapping, skip_rows: skipRows },
      });
      if (error) throw error;
      if (data.status === "review") {
        toast.success(`Parsed ${data.stats.row_count} transactions (${data.stats.duplicates_skipped} duplicates skipped)`);
        setMappingData(null);
        qc.invalidateQueries({ queryKey: ["bank_imports"] });
      }
    } catch (e: any) {
      toast.error(e.message || "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  const reviewImport = (imports.data ?? []).find(i => i.status === "review");
  const mappingImport = activeImport && mappingData;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Bank Statement Import</h3>
        <div className="flex items-center gap-2">
          <ExportHelpDialog />
          <AddBankAccountDialog onCreated={() => qc.invalidateQueries({ queryKey: ["bank_accounts"] })} />
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium">Bank Account</label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {(accounts.data ?? []).map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.bank_name} — {a.account_name}{a.last4 ? ` (···${a.last4})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Upload Statement</label>
              <div className="mt-1">
                <Input
                  type="file"
                  accept=".csv,.ofx,.qif"
                  disabled={!selectedAccountId || uploading || parsing}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
          {(uploading || parsing) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              {uploading ? "Uploading..." : "Parsing transactions..."}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Supported formats: CSV (recommended), OFX, QIF. Max file size: 5 MB.</p>
        </CardContent>
      </Card>

      {mappingImport && mappingData && (
        <CsvMappingStep
          headers={mappingData.headers}
          sampleRows={mappingData.sample_rows}
          onConfirm={(mapping, skipRows) => parseImport(activeImport!.id, mapping, skipRows)}
        />
      )}

      {reviewImport && !mappingImport && (
        <ReviewScreen
          importRec={reviewImport}
          onCommitted={() => {
            qc.invalidateQueries({ queryKey: ["bank_imports"] });
            qc.invalidateQueries({ queryKey: ["finance_entries"] });
            qc.invalidateQueries({ queryKey: ["finance_summary"] });
          }}
        />
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Import History</CardTitle></CardHeader>
        <CardContent>
          {imports.isLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-8" />)}</div>
          ) : (imports.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet. Upload your first bank statement above.</p>
          ) : (
            <div className="space-y-1">
              {(imports.data ?? []).map(imp => (
                <div key={imp.id} className="flex flex-col rounded border border-border p-2 text-sm gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {imp.status === "committed" ? <CheckCircle className="h-4 w-4 text-success" /> :
                       imp.status === "failed" || imp.status === "cancelled" ? <AlertTriangle className="h-4 w-4 text-destructive" /> :
                       imp.status === "review" ? <FileSpreadsheet className="h-4 w-4 text-warning" /> :
                       imp.status === "parsing" ? <RefreshCw className="h-4 w-4 animate-spin text-primary" /> :
                       <RefreshCw className="h-4 w-4 text-muted-foreground" />}
                      <span>{new Date(imp.imported_at).toLocaleDateString("en-ZA")}</span>
                      <Badge variant="outline" className="text-xs">{imp.file_type.toUpperCase()}</Badge>
                      <Badge variant={imp.status === "committed" ? "default" : (imp.status === "failed" || imp.status === "cancelled") ? "destructive" : "secondary"} className="text-xs">{imp.status}</Badge>
                    </div>
                    {imp.stats_json && (imp.stats_json as any).row_count && (
                      <span className="text-xs text-muted-foreground">{(imp.stats_json as any).row_count} rows</span>
                    )}
                  </div>
                  {imp.error_message && (
                    <p className="text-xs text-destructive pl-6">{imp.error_message}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}