-- Fix get_youtube_daily_stats to use Port of Spain timezone (UTC-4)
-- so "today" matches the quota reset time, not UTC midnight.

CREATE OR REPLACE FUNCTION public.get_youtube_daily_stats()
RETURNS TABLE (
  searches_today      BIGINT,
  successful_today    BIGINT,
  failed_today        BIGINT,
  cache_hits_today    BIGINT,
  quota_used_today    NUMERIC,
  quota_remaining     NUMERIC,
  active_keys         BIGINT,
  total_keys          BIGINT,
  unique_users_today  BIGINT,
  cache_entries_live  BIGINT,
  cache_hit_rate_pct  NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH today_start AS (
    SELECT (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Port_of_Spain')
            AT TIME ZONE 'America/Port_of_Spain') AS ts
  ),
  log_today AS (
    SELECT success, cache_hit, user_id
    FROM public.youtube_search_log, today_start
    WHERE created_at >= today_start.ts
  )
  SELECT
    (SELECT COUNT(*) FROM log_today)::BIGINT,
    (SELECT COUNT(*) FROM log_today WHERE success = true)::BIGINT,
    (SELECT COUNT(*) FROM log_today WHERE success = false)::BIGINT,
    (SELECT COUNT(*) FROM log_today WHERE cache_hit = true)::BIGINT,
    (SELECT COALESCE(SUM(used_today), 0) FROM public.youtube_api_keys WHERE enabled = true),
    (SELECT COALESCE(SUM(daily_limit - used_today), 0)
     FROM public.youtube_api_keys WHERE enabled = true AND NOT exhausted),
    (SELECT COUNT(*) FROM public.youtube_api_keys WHERE enabled = true AND NOT exhausted)::BIGINT,
    (SELECT COUNT(*) FROM public.youtube_api_keys WHERE enabled = true)::BIGINT,
    (SELECT COUNT(DISTINCT user_id) FROM log_today)::BIGINT,
    (SELECT COUNT(*) FROM public.youtube_search_cache WHERE expires_at > NOW())::BIGINT,
    CASE
      WHEN (SELECT COUNT(*) FROM log_today) = 0 THEN 0
      ELSE ROUND(
        (SELECT COUNT(*) FROM log_today WHERE cache_hit = true)::NUMERIC
        / (SELECT COUNT(*) FROM log_today)::NUMERIC * 100, 1)
    END;
$$;
