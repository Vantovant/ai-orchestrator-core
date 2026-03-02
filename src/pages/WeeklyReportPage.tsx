import { useQuery } from "@tanstack/react-query";
import { taskService } from "@/services/taskService";
import { reminderService } from "@/services/reminderService";
import { meetingService } from "@/services/meetingService";
import { financeEntryService } from "@/services/financeService";
import { complianceService } from "@/services/complianceService";
import { clientService } from "@/services/clientService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, FileText, CheckSquare, DollarSign, Shield, Users, Printer } from "lucide-react";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, isWithinInterval, format } from "date-fns";

const fmt = (n: number) => `R ${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function WeeklyReportPage() {
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: taskService.list });
  const reminders = useQuery({ queryKey: ["reminders"], queryFn: reminderService.list });
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingService.list });
  const entries = useQuery({ queryKey: ["finance_entries"], queryFn: financeEntryService.list });
  const compliance = useQuery({ queryKey: ["compliance"], queryFn: complianceService.list });
  const clients = useQuery({ queryKey: ["clients"], queryFn: clientService.list });

  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  const isThisWeek = (dateStr: string) => {
    try { return isWithinInterval(new Date(dateStr), { start: weekStart, end: weekEnd }); }
    catch { return false; }
  };

  const weekTasks = (tasks.data ?? []).filter(t => t.created_at && isThisWeek(t.created_at));
  const completedTasks = weekTasks.filter(t => t.status === "done");
  const weekMeetings = (meetings.data ?? []).filter(m => isThisWeek(m.start_time));
  const weekEntries = (entries.data ?? []).filter(e => isThisWeek(e.entry_date));
  const weekIncome = weekEntries.filter(e => e.type === "income").reduce((s, e) => s + Number(e.amount), 0);
  const weekExpense = weekEntries.filter(e => e.type === "expense").reduce((s, e) => s + Number(e.amount), 0);
  const overdueCompliance = (compliance.data ?? []).filter(c => !c.is_done && new Date(c.due_date) < now);
  const activeClients = (clients.data ?? []).filter(c => c.is_active);

  const isLoading = tasks.isLoading || meetings.isLoading || entries.isLoading;

  const buildSummaryText = () => {
    const lines = [
      `📊 WEEKLY EXECUTIVE REPORT`,
      `Week: ${weekLabel}`,
      ``,
      `✅ PLAN`,
      `  Tasks created: ${weekTasks.length}`,
      `  Tasks completed: ${completedTasks.length}`,
      `  Meetings held: ${weekMeetings.length}`,
      ``,
      `💰 FINANCE`,
      `  Income: ${fmt(weekIncome)}`,
      `  Expenses: ${fmt(weekExpense)}`,
      `  Net: ${fmt(weekIncome - weekExpense)}`,
      ``,
      `🛡️ COMPLIANCE`,
      `  Overdue items: ${overdueCompliance.length}`,
      ``,
      `👥 CLIENTS`,
      `  Active clients: ${activeClients.length}`,
    ];
    return lines.join("\n");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(buildSummaryText());
    toast.success("Report copied to clipboard");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" /> Weekly Report</h1>
          <p className="text-sm text-muted-foreground">{weekLabel}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleCopy} variant="outline" className="gap-2"><Copy className="h-4 w-4" /> Copy</Button>
          <Button onClick={() => window.print()} className="gap-2"><Printer className="h-4 w-4" /> Print / PDF</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}</div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Plan Summary */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckSquare className="h-4 w-4 text-primary" /> Plan Summary</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div><p className="text-2xl font-bold">{weekTasks.length}</p><p className="text-xs text-muted-foreground">Created</p></div>
                <div><p className="text-2xl font-bold">{completedTasks.length}</p><p className="text-xs text-muted-foreground">Completed</p></div>
                <div><p className="text-2xl font-bold">{weekMeetings.length}</p><p className="text-xs text-muted-foreground">Meetings</p></div>
              </div>
            </CardContent>
          </Card>

          {/* Finance Summary */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" /> Finance Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Income</span><span className="font-medium text-success">{fmt(weekIncome)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Expenses</span><span className="font-medium text-destructive">{fmt(weekExpense)}</span></div>
              <div className="border-t border-border pt-2 flex justify-between text-sm"><span className="font-medium">Net</span><span className={`font-bold ${weekIncome - weekExpense < 0 ? "text-destructive" : ""}`}>{fmt(weekIncome - weekExpense)}</span></div>
            </CardContent>
          </Card>

          {/* Compliance */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Compliance</CardTitle></CardHeader>
            <CardContent>
              {overdueCompliance.length === 0 ? (
                <p className="text-sm text-muted-foreground">All compliance items on track ✅</p>
              ) : (
                <div className="space-y-2">
                  <Badge variant="destructive">{overdueCompliance.length} overdue</Badge>
                  {overdueCompliance.slice(0, 5).map(c => (
                    <div key={c.id} className="text-sm flex justify-between"><span>{c.label}</span><span className="text-xs text-muted-foreground">{c.due_date}</span></div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Clients */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Clients & Matters</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm"><span className="font-medium">{activeClients.length}</span> active clients</p>
              {activeClients.slice(0, 5).map(c => (
                <div key={c.id} className="text-sm flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">{c.type}</Badge>
                  <span>{c.name}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
