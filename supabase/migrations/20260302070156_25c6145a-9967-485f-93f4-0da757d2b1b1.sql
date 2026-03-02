
-- Fix: restrict cache table writes to service role only (not through RLS - service role bypasses RLS anyway)
-- Drop the overly permissive ALL policy and keep only SELECT
DROP POLICY "Service role manages market_prices_cache" ON public.market_prices_cache;
DROP POLICY "Service role manages market_news_cache" ON public.market_news_cache;
