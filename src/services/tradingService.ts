import { supabase } from "@/integrations/supabase/client";

async function uid() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}
const db = supabase as any;

export interface TradingSettings {
  id: string; user_id: string; paper_account_balance_zar: number; risk_percent: number;
  learning_mode: boolean; course_video_url: string | null; mentor_reviewed: boolean;
}
export interface RuleTrade {
  id: string; symbol: string; asset_type: string; side: string; qty: number; price_at_time: number;
  currency: string; notes: string | null; occurred_at: string; is_legacy: boolean;
  tradingview_symbol: string | null; direction: "long" | "short" | null; entry_price: number | null;
  stop_loss: number | null; target_price: number | null; timeframe: string | null; setup_name: string | null;
  reason: string | null; calendar_checked: boolean; risk_percent: number | null; risk_amount_zar: number | null;
  position_size: number | null; status: "open" | "closed"; exit_price: number | null; exit_date: string | null;
  rule_followed: boolean | null; lesson: string | null; r_multiple: number | null; pnl_zar: number | null;
}
export interface TradingPlan {
  id: string; user_id: string; markets: string | null; timeframes: string | null; entry_rules: string | null;
  stop_rules: string | null; target_rules: string | null; no_trade_rules: string | null; risk_rules: string | null;
  daily_routine: string | null; updated_at: string;
}
export interface PlanVersion { id: string; snapshot: Partial<TradingPlan>; created_at: string }
export interface CourseProgress { lesson_no: number; status: "not_started" | "in_progress" | "completed"; notes: string | null }
export interface KeyLevel {
  id: string; watchlist_item_id: string; zone_low: number; zone_high: number; level_type: "support" | "resistance";
  timeframe: string | null; note: string | null; source: "me" | "claude"; verified: boolean;
}

export const DEFAULT_RISK_RULES = `- Max 1% risk per trade while learning (2% absolute ceiling later).
- No real money until 30 paper trades under this written plan are logged and reviewed.
- Every trade needs a written entry, stop loss, target and reason BEFORE entry.
- No high leverage, no revenge trading, never move a stop loss further away.
- If I'm emotional, chasing losses or trying to "make it back", stop for the day.`;

export const settingsService = {
  async get(): Promise<TradingSettings> {
    const user_id = await uid();
    const { data, error } = await db.from("trading_settings").select("*").eq("user_id", user_id).maybeSingle();
    if (error) throw error;
    if (data) return data;
    const ins = await db.from("trading_settings").insert({ user_id }).select().single();
    if (ins.error) throw ins.error;
    return ins.data;
  },
  async update(patch: Partial<TradingSettings>) {
    const user_id = await uid();
    const { error } = await db.from("trading_settings").update(patch).eq("user_id", user_id);
    if (error) throw error;
  },
};

export const ruleTradeService = {
  async list(): Promise<RuleTrade[]> {
    const user_id = await uid();
    const { data, error } = await db.from("invest_paper_trades").select("*").eq("user_id", user_id)
      .is("deleted_at", null).order("occurred_at", { ascending: false }).limit(500);
    if (error) throw error;
    return data ?? [];
  },
  async create(t: Partial<RuleTrade>) {
    const user_id = await uid();
    const { error } = await db.from("invest_paper_trades").insert({
      user_id, ...t, side: t.direction === "short" ? "sell" : "buy",
      qty: t.position_size ?? 0, price_at_time: t.entry_price ?? 0, currency: "ZAR", is_legacy: false, status: "open",
    });
    if (error) throw error;
  },
  async update(id: string, patch: Partial<RuleTrade>) {
    const { error } = await db.from("invest_paper_trades").update(patch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string) {
    const { error } = await db.from("invest_paper_trades").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },
};

const PLAN_FIELDS = ["markets", "timeframes", "entry_rules", "stop_rules", "target_rules", "no_trade_rules", "risk_rules", "daily_routine"] as const;

export const planService = {
  async get(): Promise<TradingPlan | null> {
    const user_id = await uid();
    const { data, error } = await db.from("trading_plans").select("*").eq("user_id", user_id).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    return data;
  },
  async save(current: TradingPlan | null, values: Partial<TradingPlan>) {
    const user_id = await uid();
    const clean: any = {};
    PLAN_FIELDS.forEach((f) => (clean[f] = values[f] ?? null));
    if (!current) {
      const { error } = await db.from("trading_plans").insert({ user_id, ...clean });
      if (error) throw error;
      return;
    }
    const snap: any = { updated_at: current.updated_at };
    PLAN_FIELDS.forEach((f) => (snap[f] = current[f]));
    const v = await db.from("trading_plan_versions").insert({ plan_id: current.id, user_id, snapshot: snap });
    if (v.error) throw v.error;
    const { error } = await db.from("trading_plans").update({ ...clean, updated_at: new Date().toISOString() }).eq("id", current.id);
    if (error) throw error;
  },
  async versions(planId: string): Promise<PlanVersion[]> {
    const { data, error } = await db.from("trading_plan_versions").select("*").eq("plan_id", planId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return data ?? [];
  },
};

export const courseService = {
  async list(): Promise<CourseProgress[]> {
    const user_id = await uid();
    const { data, error } = await db.from("trading_course_progress").select("lesson_no,status,notes").eq("user_id", user_id);
    if (error) throw error;
    return data ?? [];
  },
  async upsert(lesson_no: number, patch: Partial<CourseProgress>) {
    const user_id = await uid();
    const { error } = await db.from("trading_course_progress")
      .upsert({ user_id, lesson_no, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,lesson_no" });
    if (error) throw error;
  },
};

export const keyLevelService = {
  async list(itemId: string): Promise<KeyLevel[]> {
    const { data, error } = await db.from("trading_key_levels").select("*").eq("watchlist_item_id", itemId).is("deleted_at", null).order("zone_low", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
  async create(l: Omit<KeyLevel, "id">) {
    const user_id = await uid();
    const { error } = await db.from("trading_key_levels").insert({ user_id, ...l });
    if (error) throw error;
  },
  async update(id: string, patch: Partial<KeyLevel>) {
    const { error } = await db.from("trading_key_levels").update(patch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string) {
    const { error } = await db.from("trading_key_levels").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },
};

export async function setWatchItemTvSymbol(id: string, tradingview_symbol: string) {
  const { error } = await db.from("invest_watchlist_items").update({ tradingview_symbol }).eq("id", id);
  if (error) throw error;
}

// ── Pure helpers ──
const TV_DEFAULTS: Record<string, string> = {
  "BTC/USD": "BITSTAMP:BTCUSD", "ETH/USD": "BITSTAMP:ETHUSD", "USD/ZAR": "FX:USDZAR",
  "EUR/ZAR": "FX_IDC:EURZAR", "XAU/USD": "OANDA:XAUUSD", "EUR/USD": "FX:EURUSD",
  "GBP/USD": "FX:GBPUSD", "USD/JPY": "FX:USDJPY", "ZAR/USD": "FX_IDC:ZARUSD",
};
export function defaultTvSymbol(symbol: string) {
  const s = symbol.trim().toUpperCase();
  return TV_DEFAULTS[s] ?? s.replace("/", "");
}
export const tvChartUrl = (tv: string) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`;

export function calcTicket(balance: number, riskPct: number, entry: number, stop: number, target: number) {
  const riskAmount = balance * (riskPct / 100);
  const perUnit = Math.abs(entry - stop);
  const size = perUnit > 0 ? riskAmount / perUnit : 0;
  return {
    riskAmount, size, value: size * entry,
    rr: perUnit > 0 ? Math.abs(target - entry) / perUnit : 0,
  };
}

export function validateTicket(direction: "long" | "short", entry: number, stop: number, target: number): string | null {
  if (!(entry > 0 && stop > 0 && target > 0)) return "Entry, stop and target must be positive numbers.";
  if (direction === "long") {
    if (stop >= entry) return "For a long, the stop must be below entry.";
    if (target <= entry) return "For a long, the target must be above entry.";
  } else {
    if (stop <= entry) return "For a short, the stop must be above entry.";
    if (target >= entry) return "For a short, the target must be below entry.";
  }
  return null;
}

export function rMultiple(direction: "long" | "short", entry: number, stop: number, exit: number) {
  const risk = entry - stop;
  if (risk === 0) return 0;
  return direction === "long" ? (exit - entry) / risk : (entry - exit) / (stop - entry);
}

export function tradeStats(trades: RuleTrade[]) {
  const closed = trades.filter((t) => !t.is_legacy && t.status === "closed" && t.r_multiple !== null)
    .sort((a, b) => (a.exit_date ?? a.occurred_at).localeCompare(b.exit_date ?? b.occurred_at));
  const rs = closed.map((t) => Number(t.r_multiple));
  const wins = rs.filter((r) => r > 0), losses = rs.filter((r) => r <= 0);
  let streak = 0, maxStreak = 0;
  rs.forEach((r) => { streak = r <= 0 ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak); });
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
  return {
    count: closed.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    totalR: rs.reduce((s, x) => s + x, 0),
    avgR: avg(rs), avgWin: avg(wins), avgLoss: avg(losses),
    rulesPct: closed.length ? (closed.filter((t) => t.rule_followed).length / closed.length) * 100 : 0,
    maxLosingStreak: maxStreak,
  };
}

export function videoAt(url: string, seconds: number | null) {
  if (!url) return "";
  if (!seconds) return url;
  const clean = url.replace(/([?&])t=\d+s?/, "$1").replace(/[?&]$/, "");
  return clean + (clean.includes("?") ? "&" : "?") + `t=${seconds}`;
}

export function tradesToCsv(trades: RuleTrade[]) {
  const cols = ["occurred_at", "symbol", "tradingview_symbol", "direction", "setup_name", "timeframe", "entry_price", "stop_loss", "target_price", "risk_percent", "risk_amount_zar", "position_size", "status", "exit_price", "exit_date", "r_multiple", "pnl_zar", "rule_followed", "reason", "lesson", "is_legacy"] as const;
  const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...trades.map((t) => cols.map((c) => esc((t as any)[c])).join(","))].join("\n");
}
