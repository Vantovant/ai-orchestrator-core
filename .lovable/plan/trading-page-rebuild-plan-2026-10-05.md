# Trading page rebuild — plan

Additive only: no drops, no data deletion. Soft deletes via `deleted_at`. All new tables RLS `user_id = auth.uid()` with GRANTs to `authenticated` + `service_role`.

## Database (one migration, needs your OK)
New tables:
- `market_price_snapshots` (symbol, price, currency, snapshot_date, unique symbol+date) — written by the edge function (service role); read-only for signed-in users.
- `trading_settings` (user_id unique, paper_account_balance_zar 10000, risk_percent 1 with check ≤ 2, learning_mode true, course_video_url, mentor_reviewed bool, current_lesson).
- `trading_plans` (user_id unique, markets, timeframes, entry_rules, stop_rules, target_rules, no_trade_rules, risk_rules prefilled, daily_routine, updated_at).
- `trading_plan_versions` (plan_id, user_id, snapshot jsonb, created_at) — read-only history.
- `trading_course_progress` (user_id, lesson_no 1–12, status, notes, unique user+lesson).
- `trading_key_levels` (watchlist_item_id, user_id, zone_low, zone_high, level_type, timeframe, note, source me/claude, verified, deleted_at).

Added columns (nullable / defaulted):
- `invest_paper_trades`: is_legacy (true for existing rows), tradingview_symbol, direction, entry_price, stop_loss, target_price, timeframe, setup_name, reason, calendar_checked, risk_percent, risk_amount_zar, position_size, status open/closed, exit_price, exit_date, rule_followed, lesson, r_multiple, pnl_zar, deleted_at.
- `invest_watchlist_items`: tradingview_symbol.
- DB trigger on `invest_paper_trades`: reject any stop-loss update that moves further from entry while open (enforced server-side, not just UI).
- `market_prices_cache.change_1d` allowed NULL.

## Edge function `invest-market-pulse`
- FX 1-day change from frankfurter.app (today vs previous ECB day); fallback to previous row in `market_price_snapshots`; else NULL.
- Upsert today's snapshot per symbol.
- Delete AI headline generation entirely; response no longer includes headlines.
- Risk mood = "Unknown" when USD/ZAR change is NULL.

## Frontend
- New route `/trading` (title "Trading"); `/invest` and `/finance?tab=invest` redirect. Remove tab from FinancePage. Nav item with chart icon in sidebar + mobile More menu.
- Split InvestPage into `src/pages/trading/*` tabs: Overview (prices with as-of, n/a, note), Watchlist (+TradingView symbol, button, key levels, embedded Advanced Chart widget, dark theme), Paper Trade (new ticket, validation, auto-calcs, warnings/blocks, close dialog, stats, 30-trade lock, CSV export, legacy rows), Trading Plan (editor + versions), Course (12 lessons, timestamps, prompts with copy, sequential unlock, "Lesson X of 12" header), Alerts (honest banner), AI Mentor (kept, disclaimer, no news framing).
- "Check before you trade" checklist card replacing Macro & Geopolitics, with Investing.com and Forex Factory links.
- Footer: FSCA / SARS note. Mobile-first stacked layout.

## Assumptions
- Learning mode caps risk at 1% (UI + DB check ≤ 2 absolute).
- Lesson 11 has no timestamp; Watch opens the video start.
- Default TradingView symbols: BTC→BITSTAMP:BTCUSD, ETH→BITSTAMP:ETHUSD, USDZAR→FX:USDZAR, EURZAR→FX_IDC:EURZAR, gold→OANDA:XAUUSD, else symbol as typed.

## Rollback
New tables can be dropped; added columns are nullable and ignored by old code; edge function redeploy from previous commit.
