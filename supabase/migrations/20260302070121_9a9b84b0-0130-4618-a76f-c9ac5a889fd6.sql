
-- Phase 1: Invest & Trade tables

-- Watchlists
CREATE TABLE public.invest_watchlists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.invest_watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_watchlists" ON public.invest_watchlists FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_invest_watchlists_updated_at BEFORE UPDATE ON public.invest_watchlists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Watchlist items
CREATE TABLE public.invest_watchlist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  watchlist_id uuid NOT NULL REFERENCES public.invest_watchlists(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  asset_type text NOT NULL DEFAULT 'fx',
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.invest_watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_watchlist_items" ON public.invest_watchlist_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Manual holdings
CREATE TABLE public.invest_manual_holdings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  asset_type text NOT NULL DEFAULT 'stock',
  qty numeric(18,8) NOT NULL DEFAULT 0,
  avg_cost numeric(14,2),
  currency text NOT NULL DEFAULT 'ZAR',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.invest_manual_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_manual_holdings" ON public.invest_manual_holdings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_invest_manual_holdings_updated_at BEFORE UPDATE ON public.invest_manual_holdings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Paper trades
CREATE TABLE public.invest_paper_trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  asset_type text NOT NULL DEFAULT 'fx',
  side text NOT NULL DEFAULT 'buy',
  qty numeric(18,8) NOT NULL DEFAULT 0,
  price_at_time numeric(14,6) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.invest_paper_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_paper_trades" ON public.invest_paper_trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Market prices cache (shared, no RLS needed but we enable it with public read)
CREATE TABLE public.market_prices_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  asset_type text NOT NULL DEFAULT 'fx',
  price numeric(18,6) NOT NULL DEFAULT 0,
  change_1d numeric(8,4) DEFAULT 0,
  change_7d numeric(8,4) DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  asof timestamptz NOT NULL DEFAULT now(),
  UNIQUE(symbol, asset_type)
);
ALTER TABLE public.market_prices_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read market_prices_cache" ON public.market_prices_cache FOR SELECT USING (true);
CREATE POLICY "Service role manages market_prices_cache" ON public.market_prices_cache FOR ALL USING (true) WITH CHECK (true);

-- Market news cache (shared)
CREATE TABLE public.market_news_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  summary text,
  source text,
  published_at timestamptz NOT NULL DEFAULT now(),
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.market_news_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read market_news_cache" ON public.market_news_cache FOR SELECT USING (true);
CREATE POLICY "Service role manages market_news_cache" ON public.market_news_cache FOR ALL USING (true) WITH CHECK (true);

-- Alerts
CREATE TABLE public.invest_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  rule_type text NOT NULL DEFAULT 'price_above',
  symbol text NOT NULL,
  asset_type text NOT NULL DEFAULT 'fx',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.invest_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own invest_alerts" ON public.invest_alerts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_invest_alerts_updated_at BEFORE UPDATE ON public.invest_alerts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_invest_watchlist_items_watchlist ON public.invest_watchlist_items(watchlist_id);
CREATE INDEX idx_invest_paper_trades_user ON public.invest_paper_trades(user_id, occurred_at DESC);
CREATE INDEX idx_invest_manual_holdings_user ON public.invest_manual_holdings(user_id);
CREATE INDEX idx_invest_alerts_user ON public.invest_alerts(user_id);
CREATE INDEX idx_market_prices_symbol ON public.market_prices_cache(symbol, asset_type);
