CREATE OR REPLACE FUNCTION public.trading_settings_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE closed_count int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.learning_mode = true AND NEW.learning_mode = false THEN
    SELECT count(*) INTO closed_count FROM public.invest_paper_trades
      WHERE user_id = NEW.user_id AND status = 'closed' AND is_legacy = false AND deleted_at IS NULL;
    IF closed_count < 30 OR NOT NEW.mentor_reviewed THEN
      RAISE EXCEPTION 'Learning mode stays on until 30 paper trades are closed and reviewed with your mentor.';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.learning_mode = false THEN
    RAISE EXCEPTION 'Learning mode stays on until 30 paper trades are closed and reviewed with your mentor.';
  END IF;
  IF NEW.learning_mode AND NEW.risk_percent > 1 THEN
    RAISE EXCEPTION 'Risk above 1%% is blocked while learning mode is on.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.paper_trade_risk_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE lm boolean;
BEGIN
  IF NEW.is_legacy THEN RETURN NEW; END IF;
  IF NEW.entry_price IS NULL OR NEW.stop_loss IS NULL OR NEW.target_price IS NULL OR NEW.reason IS NULL OR btrim(NEW.reason) = '' THEN
    RAISE EXCEPTION 'Entry, stop loss, target and reason are required for every paper trade.';
  END IF;
  IF NEW.risk_percent IS NULL OR NEW.risk_percent <= 0 OR NEW.risk_percent > 2 THEN
    RAISE EXCEPTION 'Risk per trade must be above 0%% and at most 2%%.';
  END IF;
  SELECT learning_mode INTO lm FROM public.trading_settings WHERE user_id = NEW.user_id;
  IF COALESCE(lm, true) AND NEW.risk_percent > 1 THEN
    RAISE EXCEPTION 'Risk above 1%% is blocked while learning mode is on.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_paper_trade_risk_guard BEFORE INSERT OR UPDATE ON public.invest_paper_trades
  FOR EACH ROW EXECUTE FUNCTION public.paper_trade_risk_guard();
