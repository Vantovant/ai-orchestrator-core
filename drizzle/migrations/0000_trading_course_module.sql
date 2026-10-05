-- Price snapshots (written by edge function)
CREATE TABLE public.market_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  price numeric NOT NULL,
  currency text,
  snapshot_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, snapshot_date)
);
GRANT SELECT ON public.market_price_snapshots TO authenticated;
GRANT ALL ON public.market_price_snapshots TO service_role;
ALTER TABLE public.market_price_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read snapshots" ON public.market_price_snapshots FOR SELECT TO authenticated USING (true);

ALTER TABLE public.market_prices_cache ALTER COLUMN change_1d DROP DEFAULT;

-- Settings
CREATE TABLE public.trading_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  paper_account_balance_zar numeric NOT NULL DEFAULT 10000,
  risk_percent numeric NOT NULL DEFAULT 1 CHECK (risk_percent > 0 AND risk_percent <= 2),
  learning_mode boolean NOT NULL DEFAULT true,
  course_video_url text,
  mentor_reviewed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.trading_settings TO authenticated;
GRANT ALL ON public.trading_settings TO service_role;
ALTER TABLE public.trading_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own trading settings" ON public.trading_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.trading_settings_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.learning_mode AND NEW.risk_percent > 1 THEN
    RAISE EXCEPTION 'Risk above 1%% is blocked while learning mode is on';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_trading_settings_guard BEFORE INSERT OR UPDATE ON public.trading_settings FOR EACH ROW EXECUTE FUNCTION public.trading_settings_guard();

-- Plan + versions
CREATE TABLE public.trading_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  markets text, timeframes text, entry_rules text, stop_rules text, target_rules text,
  no_trade_rules text, risk_rules text, daily_routine text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.trading_plans TO authenticated;
GRANT ALL ON public.trading_plans TO service_role;
ALTER TABLE public.trading_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own trading plan" ON public.trading_plans FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.trading_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.trading_plans(id),
  user_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.trading_plan_versions TO authenticated;
GRANT ALL ON public.trading_plan_versions TO service_role;
ALTER TABLE public.trading_plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own plan versions" ON public.trading_plan_versions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Insert own plan versions" ON public.trading_plan_versions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Course progress
CREATE TABLE public.trading_course_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_no int NOT NULL CHECK (lesson_no BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed')),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_no)
);
GRANT SELECT, INSERT, UPDATE ON public.trading_course_progress TO authenticated;
GRANT ALL ON public.trading_course_progress TO service_role;
ALTER TABLE public.trading_course_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own course progress" ON public.trading_course_progress FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Key levels
CREATE TABLE public.trading_key_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  watchlist_item_id uuid NOT NULL REFERENCES public.invest_watchlist_items(id),
  zone_low numeric NOT NULL,
  zone_high numeric NOT NULL,
  level_type text NOT NULL CHECK (level_type IN ('support','resistance')),
  timeframe text,
  note text,
  source text NOT NULL DEFAULT 'me' CHECK (source IN ('me','claude')),
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.trading_key_levels TO authenticated;
GRANT ALL ON public.trading_key_levels TO service_role;
ALTER TABLE public.trading_key_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own key levels" ON public.trading_key_levels FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Watchlist items
ALTER TABLE public.invest_watchlist_items ADD COLUMN tradingview_symbol text;

-- Paper trades
ALTER TABLE public.invest_paper_trades
  ADD COLUMN is_legacy boolean NOT NULL DEFAULT false,
  ADD COLUMN tradingview_symbol text,
  ADD COLUMN direction text CHECK (direction IN ('long','short')),
  ADD COLUMN entry_price numeric,
  ADD COLUMN stop_loss numeric,
  ADD COLUMN target_price numeric,
  ADD COLUMN timeframe text,
  ADD COLUMN setup_name text,
  ADD COLUMN reason text,
  ADD COLUMN calendar_checked boolean NOT NULL DEFAULT false,
  ADD COLUMN risk_percent numeric,
  ADD COLUMN risk_amount_zar numeric,
  ADD COLUMN position_size numeric,
  ADD COLUMN status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  ADD COLUMN exit_price numeric,
  ADD COLUMN exit_date date,
  ADD COLUMN rule_followed boolean,
  ADD COLUMN lesson text,
  ADD COLUMN r_multiple numeric,
  ADD COLUMN pnl_zar numeric;
UPDATE public.invest_paper_trades SET is_legacy = true, status = 'closed' WHERE direction IS NULL;

CREATE OR REPLACE FUNCTION public.paper_trade_stop_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.is_legacy THEN RETURN NEW; END IF;
  IF OLD.status = 'open' AND NEW.stop_loss IS DISTINCT FROM OLD.stop_loss THEN
    IF abs(NEW.entry_price - NEW.stop_loss) > abs(OLD.entry_price - OLD.stop_loss) THEN
      RAISE EXCEPTION 'Never move your stop loss further away.';
    END IF;
  END IF;
  IF NEW.entry_price IS DISTINCT FROM OLD.entry_price AND OLD.status = 'open' THEN
    RAISE EXCEPTION 'Entry price cannot change once a trade is open.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_paper_trade_stop_guard BEFORE UPDATE ON public.invest_paper_trades FOR EACH ROW EXECUTE FUNCTION public.paper_trade_stop_guard();
