Context loaded. Here's the plan.

# Trading tools for the VantoOS Claude connector

## 1. Confirmed architecture (checked in code)

```text
Claude -> mcp-server (Railway, mcp-server/src/index.js, server.tool + zod)
       -> POST {action, body} with x-mcp-token
       -> mcp-bridge (supabase/functions/mcp-bridge/index.ts, switch(action),
          service-role client, requireOwner() = MCP_OWNER_USER_ID)
       -> database
```

- (a) Only MCP mechanism: yes. `supabase/functions/` has only `mcp-bridge` matching `mcp*`; no `src/lib/mcp`, no `mcpPlugin` in vite.config.ts, no `@lovable.dev/mcp-js` in package.json, no `.lovable/mcp/manifest.json`. The Railway URL itself is not in the repo (README uses a placeholder), so I can't confirm `friendly-success-production-29cf` from code, only that the server is designed for Railway.
- (b) Tool count: **80** `server.tool(...)` registrations, server version `1.5.0`.
- (c) Pattern to copy: the Wellness tools (`list_wellness_metrics` / `add_wellness_metric`) on the server side, and the owner-scoped finance actions (`list_finance_entries`, `create_finance_entry`) in the bridge. That covers auth (timing-safe `x-mcp-token`, `requireOwner()` fails closed with 500), errors (`json({ok:false,error:message}, status)`, which `callBridge` turns into a thrown Error) and responses (`json({ok:true, <noun>: rows, count})`, wrapped by `toolResult()` as pretty JSON text). No new pattern.

## 2. Shared database functions (one implementation for page and bridge)

What the code shows today: sizing (`calcTicket`), R-multiple (`rMultiple`), the close P/L, and the balance update all run in the browser. The close also does two separate writes (trade, then balance), so the balance can drift if the second write fails.

New SECURITY INVOKER functions. Each takes `p_user_id`, checks that it equals `auth.uid()` when called by a signed-in user, and allows any `p_user_id` only for service_role:

- `public.open_paper_trade(p_user_id, symbol, tradingview_symbol, direction, entry, stop, target, timeframe, setup_name, reason, calendar_checked)`: reads `risk_percent` and balance from trading_settings (creates the default row if it's missing), refuses `calendar_checked = false`, runs the same direction/price checks as `validateTicket`, works out `risk_amount = balance*risk%/100` and `size = risk_amount/|entry-stop|`, and inserts. The existing `trg_paper_trade_risk_guard` still fires and its message is returned unchanged.
- `public.close_paper_trade(p_user_id, trade_id, exit_price, exit_date, rule_followed, lesson)`: lesson is required and the trade must be open and owned by the user. Uses `r = rMultiple` with the same formula, `pnl = r*risk_amount_zar`, then updates the trade and adds pnl to the balance **in one transaction**.
- `public.save_trading_plan(p_user_id, patch jsonb)`: merges only the keys you pass, snapshots the previous version into trading_plan_versions first (same as `planService.save` now), and creates the plan if none exists.
- `public.set_lesson_progress(p_user_id, lesson_no, status, notes)`: lesson N can be set to in_progress/completed only if N-1 is completed.

GRANT EXECUTE goes to authenticated and service_role. Additive only: no drops, and no trigger changes.

UI switch-over (frontend logic only, no visual change): `PaperTradeTab` ticket submit becomes `rpc('open_paper_trade')`, CloseDialog becomes `rpc('close_paper_trade')`, PlanTab save becomes `rpc('save_trading_plan')`, CourseTab becomes `rpc('set_lesson_progress')`. `calcTicket`/`rMultiple` stay as **preview only**; the database result is the record.

## 3. Bridge actions and server tools (16 new, total 96, server version 1.6.0)

Read:
- `get_trading_overview`: settings fields, current lesson (first lesson not completed), closed non-legacy non-deleted count vs 30, open trades.
- `get_trading_stats` (optional from/to on exit_date): the bridge copies the `tradeStats` formula line for line. See the risk note below.
- `list_paper_trades`: status, symbol, include_legacy (default false), limit (1–100). Deleted trades are excluded.
- `get_trading_plan`: plan and updated_at, optional include_versions (latest 50).
- `list_course_progress`: all 12 lessons merged with their stored status and notes (missing means locked/not started), plus titles from courseLessons.
- `list_watchlist`: watchlists with items, including tradingview_symbol.
- `list_key_levels`: by symbol or watchlist_item_id, deleted ones excluded, with the verified flag.
- `get_market_pulse`: market_prices_cache rows with as-of time and change_1d (null stays null). Risk mood uses the same rule as invest-market-pulse: USD/ZAR change null gives Unknown, above +0.5 gives Risk-Off, below -0.5 gives Risk-On, otherwise Neutral.

Write:
- `log_paper_trade` calls `open_paper_trade` (no risk_percent parameter). `calendar_checked` is `z.literal(true)`.
- `move_stop_loss` updates stop_loss on an open owned trade. `trg_paper_trade_stop_guard` refuses a move further away, and its message is returned unchanged.
- `close_paper_trade` calls the function.
- `update_trading_plan` calls `save_trading_plan` with only the sections you pass.
- `update_lesson_progress` calls `set_lesson_progress`.
- `add_key_level`: the bridge forces `source='claude'` and `verified=false`; these are not schema parameters. Resolves the item by id, or by symbol within the owner's watchlists.
- `add_watchlist_item`: watchlist by id or name (owner's only), symbol, asset_type, tradingview_symbol.

Not exposed: a code comment block in mcp-server (and a matching one in the bridge) lists what is human-only in the app: risk_percent, learning_mode, mentor_reviewed, paper balance (except through close), verifying key levels, deleting trades/levels/plans, anything touching real money or a broker.

## 4. Deploys (how each part goes live)

- mcp-bridge: lives in this project, so I can deploy it directly after editing. I'll then call each new action once (with your real bridge token, as in earlier sessions) as a check.
- mcp-server: Railway builds from GitHub with Root Directory `mcp-server` (per README). My edits sync to GitHub automatically. Whether Railway auto-deploys on push is a Railway service setting I can't see from here. If it's on, the push triggers the deploy. If not, press Redeploy in Railway. Then in Claude, reconnect or refresh the connector so it fetches the 96-tool list.
- Page changes (the rpc switch) reach vantoos.com only after you publish.

## 5. Risks (categorised)

- Backend: a trade over 1% risk opened before learning mode was re-enabled can't be closed (the known guard gap). close_paper_trade will return that guard message unchanged rather than bypass it.
- Backend: the balance write in close goes through trg_trading_settings_guard. It only blocks learning_mode/risk changes, so a balance update passes. I'll verify this live.
- Backend: stats are computed in two places (TS `tradeStats` and the bridge). To get one source, I could add `public.trading_stats(p_user_id, from, to)` and switch the card to it. This is included unless you say otherwise.
- Permissions/RLS: the bridge uses service-role, so every query filters on `user_id = owner` explicitly. The new functions check `auth.uid()` so signed-in users can't act for others.
- Platform: Claude may cache the old tool list until the connector is refreshed.

## 6. Estimated changes

- 1 migration: 5 functions (open, close, save_plan, set_lesson, stats) and grants.
- `supabase/functions/mcp-bridge/index.ts`: about +450 lines, 16 cases.
- `mcp-server/src/index.js`: about +200 lines, 16 tools, comment block, version 1.6.0.
- `src/services/tradingService.ts`, `PaperTradeTab.tsx`, `PlanTab.tsx`, `CourseTab.tsx`, `TradingStats` usage: small rpc swaps.
- AGENTS.md: one rule ("trade open/close/plan/lesson writes go through shared DB functions").
- Verification: live bridge calls for each action, the block messages (risk, stop, calendar, lesson order), and one open, move stop, close cycle on a QA trade, then soft-delete that trade.
