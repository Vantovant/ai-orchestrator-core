CREATE OR REPLACE FUNCTION public.trading_assert_caller(p_user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id is required.'; END IF;
  IF coalesce(auth.jwt()->>'role','') = 'service_role' THEN RETURN; END IF;
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Not allowed to act for another user.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.open_paper_trade(
  p_user_id uuid, p_symbol text, p_tradingview_symbol text, p_direction text,
  p_entry numeric, p_stop numeric, p_target numeric, p_timeframe text,
  p_setup_name text, p_reason text, p_calendar_checked boolean)
RETURNS public.invest_paper_trades LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE s public.trading_settings; per_unit numeric; risk_amt numeric; size numeric; r public.invest_paper_trades;
BEGIN
  PERFORM public.trading_assert_caller(p_user_id);
  IF coalesce(btrim(p_symbol),'') = '' THEN RAISE EXCEPTION 'Symbol is required.'; END IF;
  IF p_calendar_checked IS NOT TRUE THEN RAISE EXCEPTION 'Check the economic calendar before logging a trade.'; END IF;
  IF p_direction NOT IN ('long','short') THEN RAISE EXCEPTION 'Direction must be long or short.'; END IF;
  IF NOT (p_entry > 0 AND p_stop > 0 AND p_target > 0) THEN RAISE EXCEPTION 'Entry, stop and target must be positive numbers.'; END IF;
  IF p_direction = 'long' THEN
    IF p_stop >= p_entry THEN RAISE EXCEPTION 'For a long, the stop must be below entry.'; END IF;
    IF p_target <= p_entry THEN RAISE EXCEPTION 'For a long, the target must be above entry.'; END IF;
  ELSE
    IF p_stop <= p_entry THEN RAISE EXCEPTION 'For a short, the stop must be above entry.'; END IF;
    IF p_target >= p_entry THEN RAISE EXCEPTION 'For a short, the target must be below entry.'; END IF;
  END IF;
  SELECT * INTO s FROM public.trading_settings WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.trading_settings(user_id) VALUES (p_user_id) RETURNING * INTO s;
  END IF;
  risk_amt := s.paper_account_balance_zar * (s.risk_percent / 100);
  per_unit := abs(p_entry - p_stop);
  size := CASE WHEN per_unit > 0 THEN risk_amt / per_unit ELSE 0 END;
  INSERT INTO public.invest_paper_trades(user_id, symbol, tradingview_symbol, direction, side, qty, price_at_time, currency,
    is_legacy, status, entry_price, stop_loss, target_price, timeframe, setup_name, reason, calendar_checked,
    risk_percent, risk_amount_zar, position_size)
  VALUES (p_user_id, p_symbol, p_tradingview_symbol, p_direction, CASE WHEN p_direction='short' THEN 'sell' ELSE 'buy' END,
    size, p_entry, 'ZAR', false, 'open', p_entry, p_stop, p_target, p_timeframe, p_setup_name, p_reason, true,
    s.risk_percent, risk_amt, size)
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.close_paper_trade(
  p_user_id uuid, p_trade_id uuid, p_exit_price numeric, p_exit_date date, p_rule_followed boolean, p_lesson text)
RETURNS public.invest_paper_trades LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE t public.invest_paper_trades; rm numeric; pnl numeric;
BEGIN
  PERFORM public.trading_assert_caller(p_user_id);
  IF coalesce(btrim(p_lesson),'') = '' THEN RAISE EXCEPTION 'Write the lesson from this trade before closing it.'; END IF;
  IF p_exit_price IS NULL OR p_exit_price <= 0 THEN RAISE EXCEPTION 'Exit price must be a positive number.'; END IF;
  IF p_rule_followed IS NULL THEN RAISE EXCEPTION 'Say whether you followed your rules.'; END IF;
  SELECT * INTO t FROM public.invest_paper_trades
   WHERE id = p_trade_id AND user_id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Trade not found.'; END IF;
  IF t.is_legacy THEN RAISE EXCEPTION 'Legacy trades cannot be closed here.'; END IF;
  IF t.status <> 'open' THEN RAISE EXCEPTION 'This trade is already closed.'; END IF;
  IF t.entry_price = t.stop_loss THEN rm := 0;
  ELSIF t.direction = 'long' THEN rm := (p_exit_price - t.entry_price) / (t.entry_price - t.stop_loss);
  ELSE rm := (t.entry_price - p_exit_price) / (t.stop_loss - t.entry_price);
  END IF;
  pnl := rm * coalesce(t.risk_amount_zar, 0);
  UPDATE public.invest_paper_trades SET status='closed', exit_price=p_exit_price,
    exit_date=coalesce(p_exit_date, current_date), rule_followed=p_rule_followed, lesson=p_lesson,
    r_multiple=rm, pnl_zar=pnl
   WHERE id = t.id RETURNING * INTO t;
  INSERT INTO public.trading_settings(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.trading_settings SET paper_account_balance_zar = paper_account_balance_zar + pnl, updated_at = now()
   WHERE user_id = p_user_id;
  RETURN t;
END $$;

CREATE OR REPLACE FUNCTION public.save_trading_plan(p_user_id uuid, p_patch jsonb)
RETURNS public.trading_plans LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE cur public.trading_plans; f text; k text;
  fields text[] := ARRAY['markets','timeframes','entry_rules','stop_rules','target_rules','no_trade_rules','risk_rules','daily_routine'];
BEGIN
  PERFORM public.trading_assert_caller(p_user_id);
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'Plan changes must be an object.'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (k = ANY(fields)) THEN RAISE EXCEPTION 'Unknown plan section: %', k; END IF;
  END LOOP;
  SELECT * INTO cur FROM public.trading_plans WHERE user_id = p_user_id AND deleted_at IS NULL LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.trading_plans(user_id, markets, timeframes, entry_rules, stop_rules, target_rules, no_trade_rules, risk_rules, daily_routine)
    VALUES (p_user_id, p_patch->>'markets', p_patch->>'timeframes', p_patch->>'entry_rules', p_patch->>'stop_rules',
      p_patch->>'target_rules', p_patch->>'no_trade_rules', p_patch->>'risk_rules', p_patch->>'daily_routine')
    RETURNING * INTO cur;
    RETURN cur;
  END IF;
  INSERT INTO public.trading_plan_versions(plan_id, user_id, snapshot)
  VALUES (cur.id, p_user_id, jsonb_build_object('updated_at', cur.updated_at, 'markets', cur.markets, 'timeframes', cur.timeframes,
    'entry_rules', cur.entry_rules, 'stop_rules', cur.stop_rules, 'target_rules', cur.target_rules,
    'no_trade_rules', cur.no_trade_rules, 'risk_rules', cur.risk_rules, 'daily_routine', cur.daily_routine));
  UPDATE public.trading_plans SET
    markets = CASE WHEN p_patch ? 'markets' THEN p_patch->>'markets' ELSE markets END,
    timeframes = CASE WHEN p_patch ? 'timeframes' THEN p_patch->>'timeframes' ELSE timeframes END,
    entry_rules = CASE WHEN p_patch ? 'entry_rules' THEN p_patch->>'entry_rules' ELSE entry_rules END,
    stop_rules = CASE WHEN p_patch ? 'stop_rules' THEN p_patch->>'stop_rules' ELSE stop_rules END,
    target_rules = CASE WHEN p_patch ? 'target_rules' THEN p_patch->>'target_rules' ELSE target_rules END,
    no_trade_rules = CASE WHEN p_patch ? 'no_trade_rules' THEN p_patch->>'no_trade_rules' ELSE no_trade_rules END,
    risk_rules = CASE WHEN p_patch ? 'risk_rules' THEN p_patch->>'risk_rules' ELSE risk_rules END,
    daily_routine = CASE WHEN p_patch ? 'daily_routine' THEN p_patch->>'daily_routine' ELSE daily_routine END,
    updated_at = now()
  WHERE id = cur.id RETURNING * INTO cur;
  RETURN cur;
END $$;

CREATE OR REPLACE FUNCTION public.set_lesson_progress(p_user_id uuid, p_lesson_no integer, p_status text, p_notes text DEFAULT NULL)
RETURNS public.trading_course_progress LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE prev text; r public.trading_course_progress;
BEGIN
  PERFORM public.trading_assert_caller(p_user_id);
  IF p_lesson_no IS NULL OR p_lesson_no < 1 OR p_lesson_no > 12 THEN RAISE EXCEPTION 'Lesson must be between 1 and 12.'; END IF;
  IF p_status NOT IN ('not_started','in_progress','completed') THEN RAISE EXCEPTION 'Status must be not_started, in_progress or completed.'; END IF;
  IF p_lesson_no > 1 AND p_status IN ('in_progress','completed') THEN
    SELECT status INTO prev FROM public.trading_course_progress WHERE user_id = p_user_id AND lesson_no = p_lesson_no - 1;
    IF coalesce(prev,'not_started') <> 'completed' THEN
      RAISE EXCEPTION 'Lesson % is locked until lesson % is completed.', p_lesson_no, p_lesson_no - 1;
    END IF;
  END IF;
  INSERT INTO public.trading_course_progress(user_id, lesson_no, status, notes, updated_at)
  VALUES (p_user_id, p_lesson_no, p_status, p_notes, now())
  ON CONFLICT (user_id, lesson_no) DO UPDATE SET status = EXCLUDED.status,
    notes = coalesce(EXCLUDED.notes, public.trading_course_progress.notes), updated_at = now()
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.trading_stats(p_user_id uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE rec record; n int := 0; wins int := 0; losses int := 0; rules int := 0;
  total numeric := 0; win_sum numeric := 0; loss_sum numeric := 0; streak int := 0; max_streak int := 0;
BEGIN
  PERFORM public.trading_assert_caller(p_user_id);
  FOR rec IN SELECT r_multiple::numeric AS r, rule_followed FROM public.invest_paper_trades
    WHERE user_id = p_user_id AND NOT is_legacy AND status = 'closed' AND r_multiple IS NOT NULL AND deleted_at IS NULL
      AND (p_from IS NULL OR coalesce(exit_date, occurred_at::date) >= p_from)
      AND (p_to IS NULL OR coalesce(exit_date, occurred_at::date) <= p_to)
    ORDER BY coalesce(exit_date::timestamptz, occurred_at), occurred_at
  LOOP
    n := n + 1; total := total + rec.r;
    IF rec.rule_followed THEN rules := rules + 1; END IF;
    IF rec.r > 0 THEN wins := wins + 1; win_sum := win_sum + rec.r; streak := 0;
    ELSE losses := losses + 1; loss_sum := loss_sum + rec.r; streak := streak + 1; END IF;
    max_streak := greatest(max_streak, streak);
  END LOOP;
  RETURN jsonb_build_object(
    'count', n,
    'winRate', CASE WHEN n > 0 THEN wins::numeric / n * 100 ELSE 0 END,
    'totalR', total,
    'avgR', CASE WHEN n > 0 THEN total / n ELSE 0 END,
    'avgWin', CASE WHEN wins > 0 THEN win_sum / wins ELSE 0 END,
    'avgLoss', CASE WHEN losses > 0 THEN loss_sum / losses ELSE 0 END,
    'rulesPct', CASE WHEN n > 0 THEN rules::numeric / n * 100 ELSE 0 END,
    'maxLosingStreak', max_streak);
END $$;

REVOKE ALL ON FUNCTION public.trading_assert_caller(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_paper_trade(uuid,text,text,text,numeric,numeric,numeric,text,text,text,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_paper_trade(uuid,uuid,numeric,date,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_trading_plan(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_lesson_progress(uuid,integer,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trading_stats(uuid,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trading_assert_caller(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_paper_trade(uuid,text,text,text,numeric,numeric,numeric,text,text,text,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_paper_trade(uuid,uuid,numeric,date,boolean,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_trading_plan(uuid,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_lesson_progress(uuid,integer,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trading_stats(uuid,date,date) TO authenticated, service_role;