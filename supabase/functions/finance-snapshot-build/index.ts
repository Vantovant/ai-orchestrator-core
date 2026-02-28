import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PAYLOAD_CHARS = 4000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [entriesRes, debtsRes, streamsRes, profileRes, contextRes] = await Promise.all([
      supabase
        .from("finance_entries")
        .select("id, type, category, amount, entry_date, source")
        .is("deleted_at", null)
        .gte("entry_date", thirtyDaysAgo)
        .order("entry_date", { ascending: false })
        .limit(100),
      supabase
        .from("debts")
        .select("id, lender_name, principal, interest_rate, repayment_amount, due_day, status")
        .is("deleted_at", null)
        .eq("status", "active"),
      supabase
        .from("income_streams")
        .select("id, stream_type, label, monthly_target, current_month_income")
        .is("deleted_at", null),
      supabase
        .from("finance_profiles")
        .select("currency, role_profile, vat_registered, provisional_tax, payroll_employer, bankability")
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("executive_context")
        .select("context_key, context_value")
        .is("deleted_at", null)
        .limit(20),
    ]);

    const entries = entriesRes.data ?? [];
    const debts = debtsRes.data ?? [];
    const streams = streamsRes.data ?? [];
    const profile = profileRes.data;

    // Compute summaries
    const totalIncome = entries.filter((e: any) => e.type === "income").reduce((s: number, e: any) => s + Number(e.amount), 0);
    const totalExpense = entries.filter((e: any) => e.type === "expense").reduce((s: number, e: any) => s + Number(e.amount), 0);

    const expenseByCategory: Record<string, number> = {};
    entries.filter((e: any) => e.type === "expense").forEach((e: any) => {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.amount);
    });
    const topExpenseCategories = Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, total]) => ({ category, total }));

    const debtSummary = {
      count: debts.length,
      totalOutstanding: debts.reduce((s: number, d: any) => s + Number(d.principal), 0),
      nextDue: debts
        .filter((d: any) => d.due_day)
        .sort((a: any, b: any) => a.due_day - b.due_day)
        .slice(0, 1)
        .map((d: any) => ({ lender: d.lender_name, dueDay: d.due_day, amount: d.repayment_amount })),
    };

    const streamsSummary = streams.map((s: any) => ({
      type: s.stream_type,
      label: s.label,
      target: Number(s.monthly_target),
      actual: Number(s.current_month_income),
    }));

    // Truncate executive context
    let contextMap: Record<string, string> = {};
    let totalChars = 0;
    for (const c of (contextRes.data ?? []) as any[]) {
      const val = String(c.context_value).slice(0, 500);
      if (totalChars + val.length > 2000) {
        contextMap[c.context_key] = val.slice(0, 2000 - totalChars) + " (truncated)";
        break;
      }
      contextMap[c.context_key] = val;
      totalChars += val.length;
    }

    const snapshot = {
      generatedAt: now.toISOString(),
      currency: profile?.currency ?? "ZAR",
      roleProfile: profile?.role_profile ?? "Business only",
      bankability: profile?.bankability ?? "bankable",
      taxFlags: {
        vat: profile?.vat_registered ?? false,
        provisional: profile?.provisional_tax ?? false,
        payroll: profile?.payroll_employer ?? false,
      },
      last30Days: { income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense },
      topExpenseCategories,
      debtSummary,
      incomeStreams: streamsSummary,
      latestEntries: entries.slice(0, 5),
      executiveContext: contextMap,
    };

    // Hard cap
    let payload = JSON.stringify(snapshot);
    if (payload.length > MAX_PAYLOAD_CHARS) {
      const trimmed = { ...snapshot, latestEntries: entries.slice(0, 2), executiveContext: {} };
      payload = JSON.stringify(trimmed);
    }

    return new Response(payload, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("finance-snapshot-build error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
