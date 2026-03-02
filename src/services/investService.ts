import { supabase } from "@/integrations/supabase/client";

// ── Types ──
export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  watchlist_id: string;
  symbol: string;
  asset_type: string;
  created_at: string;
}

export interface ManualHolding {
  id: string;
  user_id: string;
  symbol: string;
  asset_type: string;
  qty: number;
  avg_cost: number | null;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaperTrade {
  id: string;
  user_id: string;
  symbol: string;
  asset_type: string;
  side: string;
  qty: number;
  price_at_time: number;
  currency: string;
  notes: string | null;
  occurred_at: string;
}

export interface MarketPrice {
  symbol: string;
  asset_type: string;
  price: number;
  change_1d: number;
  change_7d: number;
  currency: string;
  asof: string;
}

export interface MarketNews {
  id: string;
  title: string;
  summary: string | null;
  source: string | null;
  published_at: string;
  tags: any;
}

export interface InvestAlert {
  id: string;
  user_id: string;
  rule_type: string;
  symbol: string;
  asset_type: string;
  params: any;
  enabled: boolean;
  triggered_at: string | null;
  created_at: string;
}

// ── Helpers ──
async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

// ── Watchlists ──
export const watchlistService = {
  async list(): Promise<Watchlist[]> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_watchlists")
      .select("*")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Watchlist[];
  },

  async create(name: string): Promise<Watchlist> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_watchlists")
      .insert({ user_id: uid, name })
      .select()
      .single();
    if (error) throw error;
    return data as Watchlist;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from("invest_watchlists")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};

export const watchlistItemService = {
  async list(watchlistId: string): Promise<WatchlistItem[]> {
    const { data, error } = await supabase
      .from("invest_watchlist_items")
      .select("*")
      .eq("watchlist_id", watchlistId)
      .is("deleted_at", null)
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as WatchlistItem[];
  },

  async add(watchlistId: string, symbol: string, assetType: string): Promise<WatchlistItem> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_watchlist_items")
      .insert({ user_id: uid, watchlist_id: watchlistId, symbol, asset_type: assetType })
      .select()
      .single();
    if (error) throw error;
    return data as WatchlistItem;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from("invest_watchlist_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};

// ── Manual Holdings ──
export const holdingService = {
  async list(): Promise<ManualHolding[]> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_manual_holdings")
      .select("*")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as ManualHolding[];
  },

  async create(h: Pick<ManualHolding, "symbol" | "asset_type" | "qty"> & Partial<Pick<ManualHolding, "avg_cost" | "currency" | "notes">>): Promise<ManualHolding> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_manual_holdings")
      .insert({ user_id: uid, ...h })
      .select()
      .single();
    if (error) throw error;
    return data as ManualHolding;
  },

  async update(id: string, updates: Partial<Pick<ManualHolding, "qty" | "avg_cost" | "notes">>): Promise<ManualHolding> {
    const { data, error } = await supabase
      .from("invest_manual_holdings")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as ManualHolding;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from("invest_manual_holdings")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};

// ── Paper Trades ──
export const paperTradeService = {
  async list(): Promise<PaperTrade[]> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_paper_trades")
      .select("*")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as PaperTrade[];
  },

  async create(t: Pick<PaperTrade, "symbol" | "asset_type" | "side" | "qty" | "price_at_time"> & Partial<Pick<PaperTrade, "currency" | "notes">>): Promise<PaperTrade> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_paper_trades")
      .insert({ user_id: uid, ...t })
      .select()
      .single();
    if (error) throw error;
    return data as PaperTrade;
  },
};

// ── Market Data (cached) ──
export const marketDataService = {
  async getPrices(): Promise<MarketPrice[]> {
    const { data, error } = await supabase
      .from("market_prices_cache")
      .select("*")
      .order("symbol");
    if (error) throw error;
    return (data ?? []) as MarketPrice[];
  },

  async getNews(): Promise<MarketNews[]> {
    const { data, error } = await supabase
      .from("market_news_cache")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return (data ?? []) as MarketNews[];
  },

  async refreshMarketPulse(): Promise<any> {
    const { data, error } = await supabase.functions.invoke("invest-market-pulse");
    if (error) throw error;
    return data;
  },
};

// ── Alerts ──
export const alertService = {
  async list(): Promise<InvestAlert[]> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_alerts")
      .select("*")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as InvestAlert[];
  },

  async create(a: Pick<InvestAlert, "rule_type" | "symbol" | "asset_type" | "params">): Promise<InvestAlert> {
    const uid = await getUserId();
    const { data, error } = await supabase
      .from("invest_alerts")
      .insert({ user_id: uid, ...a })
      .select()
      .single();
    if (error) throw error;
    return data as InvestAlert;
  },

  async toggle(id: string, enabled: boolean): Promise<void> {
    const { error } = await supabase
      .from("invest_alerts")
      .update({ enabled })
      .eq("id", id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from("invest_alerts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },
};
