import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  financeProfileService, financeEntryService, debtService,
  incomeStreamService, opportunityService,
  type FinanceEntry, type Debt, type IncomeStream, type Opportunity,
} from "@/services/financeService";
import { bankTransactionService } from "@/services/bankImportService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign, Plus, TrendingUp, TrendingDown, AlertTriangle, Zap,
  Trash2, Download, RefreshCw, Target, Lightbulb, Shield, CreditCard,
  FileSpreadsheet, Banknote, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import BankImportTab from "@/components/finance/BankImportTab";
import BudgetTab from "@/components/finance/BudgetTab";
import FinanceNotesPanel from "@/components/finance/FinanceNotesPanel";
import VoiceInput from "@/components/voice/VoiceInput";
import { parseVoiceCommand } from "@/lib/voiceCommandParser";

// ── Formatters ──
const fmt = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Add Entry Dialog ──
function AddEntryDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("expense");
  const [category, setCategory] = useState("general");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [source, setSource] = useState("other");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: () => financeEntryService.create({ type, category, amount: Math.abs(parseFloat(amount)), entry_date: date, source, notes: notes || undefined }),
    onSuccess: () => { onCreated(); setOpen(false); setAmount(""); setNotes(""); toast.success("Entry added"); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleVoiceFinance = (text: string) => {
    const cmd = parseVoiceCommand(text);
    if (cmd.intent === "add_expense") {
      setType("expense");
      if (cmd.amount) setAmount(String(cmd.amount));
      if (cmd.title) setCategory(cmd.title);
      if (cmd.date) setDate(cmd.date.toISOString().split("T")[0]);
    } else if (cmd.intent === "add_income") {
      setType("income");
      if (cmd.amount) setAmount(String(cmd.amount));
      if (cmd.title) setCategory(cmd.title);
      if (cmd.date) setDate(cmd.date.toISOString().split("T")[0]);
    } else {
      toast.info("Try saying: 'I spent R650 on fuel today'");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Add Entry</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Add Finance Entry</DialogTitle>
            <VoiceInput onTranscript={handleVoiceFinance} compact />
          </div>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="income">Income</SelectItem><SelectItem value="expense">Expense</SelectItem></SelectContent></Select>
            <Select value={source} onValueChange={setSource}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="salary">Salary</SelectItem><SelectItem value="business">Business</SelectItem><SelectItem value="network_marketing">Network Marketing</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select>
          </div>
          <Input placeholder="Category (e.g. rent, fuel, legal fees)" value={category} onChange={(e) => setCategory(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" placeholder="Amount (ZAR)" value={amount} onChange={(e) => setAmount(e.target.value)} required min="0" step="0.01" />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <Textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          <Button type="submit" className="w-full" disabled={mut.isPending}>{mut.isPending ? "Saving..." : "Save Entry"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Debt Dialog ──
function AddDebtDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [lender, setLender] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [repayment, setRepayment] = useState("");
  const [dueDay, setDueDay] = useState("");

  const mut = useMutation({
    mutationFn: () => debtService.create({
      lender_name: lender, principal: parseFloat(principal),
      interest_rate: rate ? parseFloat(rate) : undefined,
      repayment_amount: repayment ? parseFloat(repayment) : undefined,
      due_day: dueDay ? parseInt(dueDay) : undefined,
    }),
    onSuccess: () => { onCreated(); setOpen(false); setLender(""); setPrincipal(""); toast.success("Debt added"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Add Debt</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Debt</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <Input placeholder="Lender name" value={lender} onChange={(e) => setLender(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" placeholder="Principal (ZAR)" value={principal} onChange={(e) => setPrincipal(e.target.value)} required min="0" step="0.01" />
            <Input type="number" placeholder="Interest rate %" value={rate} onChange={(e) => setRate(e.target.value)} min="0" step="0.01" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input type="number" placeholder="Repayment amount" value={repayment} onChange={(e) => setRepayment(e.target.value)} min="0" step="0.01" />
            <Input type="number" placeholder="Due day (1-31)" value={dueDay} onChange={(e) => setDueDay(e.target.value)} min="1" max="31" />
          </div>
          <Button type="submit" className="w-full" disabled={mut.isPending}>{mut.isPending ? "Saving..." : "Add Debt"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Income Stream Dialog ──
function AddStreamDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [streamType, setStreamType] = useState("salary");
  const [target, setTarget] = useState("");

  const mut = useMutation({
    mutationFn: () => incomeStreamService.create({ stream_type: streamType, label, monthly_target: parseFloat(target) }),
    onSuccess: () => { onCreated(); setOpen(false); setLabel(""); toast.success("Stream added"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1"><Plus className="h-4 w-4" /> Add Stream</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Income Stream</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}>
          <Input placeholder="Label (e.g. Legal Practice)" value={label} onChange={(e) => setLabel(e.target.value)} required />
          <div className="grid grid-cols-2 gap-3">
            <Select value={streamType} onValueChange={setStreamType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="salary">Salary</SelectItem><SelectItem value="legal/accounting practice">Legal/Accounting</SelectItem><SelectItem value="network marketing">Network Marketing</SelectItem><SelectItem value="side hustle">Side Hustle</SelectItem></SelectContent></Select>
            <Input type="number" placeholder="Monthly target (ZAR)" value={target} onChange={(e) => setTarget(e.target.value)} required min="0" step="0.01" />
          </div>
          <Button type="submit" className="w-full" disabled={mut.isPending}>{mut.isPending ? "Saving..." : "Add Stream"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Finance Page ──
export default function FinancePage() {
  const qc = useQueryClient();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const entries = useQuery({ queryKey: ["finance_entries"], queryFn: financeEntryService.list });
  const debts = useQuery({ queryKey: ["debts"], queryFn: debtService.list });
  const streams = useQuery({ queryKey: ["income_streams"], queryFn: incomeStreamService.list });
  const opportunities = useQuery({ queryKey: ["opportunities"], queryFn: opportunityService.list });
  const profile = useQuery({ queryKey: ["finance_profile"], queryFn: financeProfileService.get });
  const summary = useQuery({
    queryKey: ["finance_summary", selectedYear, selectedMonth],
    queryFn: () => financeEntryService.monthlySummary(selectedYear, selectedMonth),
  });

  const [mentorResult, setMentorResult] = useState<any>(null);
  const [mentorLoading, setMentorLoading] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["finance_entries"] });
    qc.invalidateQueries({ queryKey: ["finance_summary"] });
    qc.invalidateQueries({ queryKey: ["debts"] });
    qc.invalidateQueries({ queryKey: ["income_streams"] });
    qc.invalidateQueries({ queryKey: ["opportunities"] });
  };

  const runMentor = async () => {
    setMentorLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("finance-mentor");
      if (error) throw error;
      setMentorResult(data);
      if (data.ai_status === "ok") toast.success("Finance briefing generated");
      else toast.info(data.message || "Generated in standard mode");
    } catch (err: any) {
      toast.error(err.message || "Failed to generate finance briefing");
    } finally {
      setMentorLoading(false);
    }
  };

  const exportEntries = async () => {
    try {
      const csv = await financeEntryService.exportCsv();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance_entries_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Entries exported");
    } catch (e: any) { toast.error(e.message); }
  };

  const exportDebts = async () => {
    try {
      const csv = await debtService.exportCsv();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `debts_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Debts exported");
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteEntryMut = useMutation({
    mutationFn: financeEntryService.softDelete,
    onSuccess: invalidateAll,
  });

  const deleteDebtMut = useMutation({
    mutationFn: debtService.softDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debts"] }),
  });

  const settleDebtMut = useMutation({
    mutationFn: (id: string) => debtService.update(id, { status: "settled" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["debts"] }); toast.success("Debt settled"); },
  });

  const deleteStreamMut = useMutation({
    mutationFn: incomeStreamService.softDelete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["income_streams"] }),
  });

  const isLoading = entries.isLoading || debts.isLoading || streams.isLoading;
  const activeDebts = (debts.data ?? []).filter((d) => d.status === "active");
  const totalDebt = activeDebts.reduce((s, d) => s + Number(d.principal), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finance</h1>
          <p className="text-sm text-muted-foreground">South African Executive Financial Intelligence</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <AddEntryDialog onCreated={invalidateAll} />
          <FinanceNotesPanel />
          <Button variant="outline" size="sm" className="gap-1" onClick={exportEntries}><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {/* Month Selector + Money Snapshot Cards */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground">Showing:</span>
        <Select value={`${selectedYear}-${selectedMonth}`} onValueChange={(v) => { const [y, m] = v.split("-").map(Number); setSelectedYear(y); setSelectedMonth(m); }}>
          <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 6 }, (_, i) => {
              const d = new Date(now.getFullYear(), now.getMonth() - i);
              return <SelectItem key={i} value={`${d.getFullYear()}-${d.getMonth()}`}>{d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}</SelectItem>;
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
              <TrendingUp className="h-6 w-6 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Income ({summary.data?.monthLabel ?? "..."})</p>
              {summary.isLoading ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-bold">{fmt(summary.data?.totalIncome ?? 0)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
              <TrendingDown className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Expenses ({summary.data?.monthLabel ?? "..."})</p>
              {summary.isLoading ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-bold">{fmt(summary.data?.totalExpense ?? 0)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <DollarSign className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Net ({summary.data?.monthLabel ?? "..."})</p>
              {summary.isLoading ? <Skeleton className="h-7 w-24" /> : <p className={`text-xl font-bold ${(summary.data?.net ?? 0) < 0 ? "text-destructive" : ""}`}>{fmt(summary.data?.net ?? 0)}</p>}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
              <CreditCard className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Debt Outstanding</p>
              {debts.isLoading ? <Skeleton className="h-7 w-24" /> : <p className="text-xl font-bold">{fmt(totalDebt)}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex w-full overflow-x-auto no-scrollbar">
          <TabsTrigger value="overview" className="shrink-0 px-3 text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="debts" className="shrink-0 px-3 text-xs sm:text-sm">Debt Radar</TabsTrigger>
          <TabsTrigger value="income" className="shrink-0 px-3 text-xs sm:text-sm">Income Engine</TabsTrigger>
          <TabsTrigger value="opportunities" className="shrink-0 px-3 text-xs sm:text-sm">Opportunities</TabsTrigger>
          <TabsTrigger value="import" className="shrink-0 px-3 text-xs sm:text-sm">Import</TabsTrigger>
          <TabsTrigger value="mentor" className="shrink-0 px-3 text-xs sm:text-sm">AI Mentor</TabsTrigger>
          <TabsTrigger value="budget" className="shrink-0 px-3 text-xs sm:text-sm">Budget</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent Entries</CardTitle></CardHeader>
            <CardContent>
              {entries.isLoading ? (
                <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : (entries.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No entries yet. Add your first income or expense.</p>
              ) : (
                <div className="space-y-2">
                  {(entries.data ?? []).slice(0, 15).map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Badge variant={e.type === "income" ? "default" : "destructive"} className="text-xs">{e.type}</Badge>
                        <div className="min-w-0">
                          <span className="text-sm font-medium">{e.category}</span>
                          <p className="text-xs text-muted-foreground">{e.entry_date} · {e.source}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${e.type === "income" ? "text-success" : "text-destructive"}`}>
                          {e.type === "income" ? "+" : "-"}{fmt(Number(e.amount))}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteEntryMut.mutate(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DEBT RADAR TAB ── */}
        <TabsContent value="debts" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Debt Radar</h3>
            <div className="flex gap-2">
              <AddDebtDialog onCreated={() => qc.invalidateQueries({ queryKey: ["debts"] })} />
              <Button variant="outline" size="sm" className="gap-1" onClick={exportDebts}><Download className="h-4 w-4" /> Export</Button>
            </div>
          </div>
          {debts.isLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : activeDebts.length === 0 ? (
            <Card><CardContent className="py-8 text-center"><p className="text-sm text-muted-foreground">No active debts. 🎉</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {activeDebts.map((d) => {
                const monthsToPayoff = d.repayment_amount && d.repayment_amount > 0 ? Math.ceil(Number(d.principal) / Number(d.repayment_amount)) : null;
                return (
                  <Card key={d.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{d.lender_name}</span>
                            {d.interest_rate && <Badge variant="outline" className="text-xs">{Number(d.interest_rate)}% p.a.</Badge>}
                          </div>
                          <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                            <span>Principal: {fmt(Number(d.principal))}</span>
                            {d.repayment_amount && <span>Repayment: {fmt(Number(d.repayment_amount))}/mo</span>}
                            {d.due_day && <span>Due: Day {d.due_day}</span>}
                          </div>
                          {monthsToPayoff && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">Simple payoff estimate</span>
                                <span className="font-medium">{monthsToPayoff} months</span>
                              </div>
                              <Progress value={Math.min(100, (1 / monthsToPayoff) * 100)} className="h-1.5" />
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" className="text-xs" onClick={() => settleDebtMut.mutate(d.id)}>Settle</Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteDebtMut.mutate(d.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── INCOME ENGINE TAB ── */}
        <TabsContent value="income" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Income Engine</h3>
            <AddStreamDialog onCreated={() => qc.invalidateQueries({ queryKey: ["income_streams"] })} />
          </div>
          {streams.isLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (streams.data ?? []).length === 0 ? (
            <Card><CardContent className="py-8 text-center"><p className="text-sm text-muted-foreground">No income streams tracked yet. Add your first stream.</p></CardContent></Card>
          ) : (
            <div className="space-y-3">
              {(streams.data ?? []).map((s) => {
                const pct = Number(s.monthly_target) > 0 ? Math.min(100, (Number(s.current_month_income) / Number(s.monthly_target)) * 100) : 0;
                return (
                  <Card key={s.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.label || s.stream_type}</span>
                            <Badge variant="outline" className="text-xs">{s.stream_type}</Badge>
                          </div>
                          <div className="mt-2">
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-muted-foreground">{fmt(Number(s.current_month_income))} of {fmt(Number(s.monthly_target))}</span>
                              <span className="font-medium">{pct.toFixed(0)}%</span>
                            </div>
                            <Progress value={pct} className="h-2" />
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteStreamMut.mutate(s.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── OPPORTUNITIES TAB ── */}
        <TabsContent value="opportunities" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Opportunity Board</h3>
          </div>
          {opportunities.isLoading ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (opportunities.data ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Lightbulb className="h-8 w-8 mx-auto mb-2 text-warning" />
                <p className="text-sm text-muted-foreground">No opportunities yet. Run Finance Mentor to get AI suggestions.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(opportunities.data ?? []).map((o) => (
                <Card key={o.id}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {o.ai_generated && <Zap className="h-4 w-4 text-accent flex-shrink-0" />}
                      <div className="min-w-0">
                        <span className="text-sm font-medium">{o.title}</span>
                        <div className="flex gap-2 mt-0.5">
                          <Badge variant="outline" className="text-xs">{o.type}</Badge>
                          <Badge variant="secondary" className="text-xs">{o.difficulty}</Badge>
                          {o.estimated_value && <span className="text-xs text-muted-foreground">{fmt(Number(o.estimated_value))}</span>}
                        </div>
                      </div>
                    </div>
                    <Badge variant={o.status === "open" ? "default" : "secondary"}>{o.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        {/* ── IMPORT TAB ── */}
        <TabsContent value="import" className="space-y-4">
          <BankImportTab />
        </TabsContent>

        {/* ── AI MENTOR TAB ── */}
        <TabsContent value="mentor" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Zap className="h-5 w-5 text-accent" /> Finance Mentor</h3>
            <Button onClick={runMentor} disabled={mentorLoading} className="gap-2">
              {mentorLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              {mentorLoading ? "Analyzing..." : "Generate Finance Briefing"}
            </Button>
          </div>

          {mentorResult && mentorResult.ai_status !== "ok" && (
            <Card className="border-warning/50 bg-warning/5">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <p className="text-sm">{mentorResult.message}</p>
              </CardContent>
            </Card>
          )}

          {!mentorResult ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Shield className="h-10 w-10 mx-auto mb-3 text-primary" />
                <h3 className="font-semibold mb-1">Your AI Finance Mentor</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Get personalized money plans, debt strategies, income growth actions, and SA-specific economic guidance.
                </p>
                <p className="text-xs text-muted-foreground mt-2 italic">General guidance only — not legal, tax, or financial advice.</p>
              </CardContent>
            </Card>
          ) : mentorResult.ai_status === "ok" ? (
            <div className="space-y-4">
              {/* Money Plan */}
              {(mentorResult.moneyPlan?.thisWeek?.length > 0 || mentorResult.moneyPlan?.thisMonth?.length > 0) && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Money Plan</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {mentorResult.moneyPlan.thisWeek?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">This Week</h4>
                        {mentorResult.moneyPlan.thisWeek.map((a: any, i: number) => (
                          <div key={i} className="rounded-lg border border-border p-3 mb-2">
                            <p className="text-sm font-medium">{a.action}</p>
                            <p className="text-xs text-muted-foreground">{a.reason}</p>
                            <Badge variant="outline" className="text-xs mt-1">{a.impact}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                    {mentorResult.moneyPlan.thisMonth?.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">This Month</h4>
                        {mentorResult.moneyPlan.thisMonth.map((a: any, i: number) => (
                          <div key={i} className="rounded-lg border border-border p-3 mb-2">
                            <p className="text-sm font-medium">{a.action}</p>
                            <p className="text-xs text-muted-foreground">{a.reason}</p>
                            <Badge variant="outline" className="text-xs mt-1">{a.impact}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Debt Plan */}
              {mentorResult.debtPlan?.nextSteps?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-warning" /> Debt Strategy: {mentorResult.debtPlan.strategy}</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      {mentorResult.debtPlan.nextSteps.map((s: string, i: number) => <li key={i}>{s}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Income Plan */}
              {(mentorResult.incomePlan?.increaseIncomeActions?.length > 0 || mentorResult.incomePlan?.opportunities?.length > 0) && (
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" /> Income Growth Plan</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {mentorResult.incomePlan.increaseIncomeActions?.map((a: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm"><span className="text-success mt-0.5">•</span> {a}</div>
                    ))}
                    {mentorResult.incomePlan.opportunities?.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-medium text-muted-foreground mb-1">Opportunities</h4>
                        {mentorResult.incomePlan.opportunities.map((o: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm"><Lightbulb className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" /> {o}</div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Risk Flags */}
              {mentorResult.riskFlags?.length > 0 && (
                <Card className="border-destructive/30">
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Risk Flags</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-5 text-sm space-y-1">
                      {mentorResult.riskFlags.map((f: string, i: number) => <li key={i} className="text-destructive">{f}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* SA Context Notes */}
              {mentorResult.saContextNotes?.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">🇿🇦 South African Context</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                      {mentorResult.saContextNotes.map((n: string, i: number) => <li key={i}>{n}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Disclaimer */}
              <p className="text-xs text-muted-foreground text-center italic">{mentorResult.disclaimer}</p>
            </div>
          ) : null}
        </TabsContent>
        {/* ── BUDGET TAB ── */}
        <TabsContent value="budget" className="space-y-4">
          <BudgetTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
