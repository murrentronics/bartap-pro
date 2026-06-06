-- ─────────────────────────────────────────────────────────────────────────────
-- YouTube Search Cache + Per-User Rate Limiting
--
-- Problem: search.list costs 100 quota units each call.
--   10 keys × 10 000 units = 100 000 units = 1 000 real API calls/day.
--   100 bars × ~30 searches/day = 3 000 calls needed → NOT enough without caching.
--
-- Solution:
--   1. Cache every result set for CACHE_TTL_HOURS (default 6h).
--      Same query from any bar hits the cache — 0 quota cost.
--   2. Per-user daily search budget (default 50 real API calls/day).
--      Bars that exceed budget still get cached results; they just can't
--      trigger fresh API calls until tomorrow.
--   3. Popular queries pre-fetched once/day by a cron (warm_youtube_cache fn).
--
-- With typical overlap (many bars searching the same genres) cache hit rate
-- is 70-90%, stretching 1 000 real calls to cover hundreds of active bars.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Cache table ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.youtube_search_cache (
  cache_key    TEXT        PRIMARY KEY,          -- normalised "q|type" string
  query        TEXT        NOT NULL,
  type         TEXT        NOT NULL DEFAULT 'video',
  results_json JSONB       NOT NULL,             -- the slimmed items array
  hit_count    INTEGER     NOT NULL DEFAULT 0,   -- how many times served from cache
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL              -- cache TTL
);

CREATE INDEX IF NOT EXISTS idx_yt_cache_expires ON public.youtube_search_cache(expires_at);

-- Only service role / edge functions write to this table
ALTER TABLE public.youtube_search_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view cache"
  ON public.youtube_search_cache FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Per-user daily budget table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.youtube_user_quota (
  user_id       UUID        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  daily_budget  INTEGER     NOT NULL DEFAULT 50,   -- admin can raise/lower per user
  used_today    INTEGER     NOT NULL DEFAULT 0,
  budget_date   DATE        NOT NULL DEFAULT CURRENT_DATE,  -- resets when date changes
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.youtube_user_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quota"
  ON public.youtube_user_quota FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all quotas"
  ON public.youtube_user_quota FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Atomic function: check user budget + serve or reject ─────────────────────
-- Returns: 'ok' | 'cache_only' (over budget but can still get cached results)
-- The edge function calls this before deciding whether to hit YouTube API.

CREATE OR REPLACE FUNCTION public.yt_check_user_budget(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_budget  INTEGER;
  v_used    INTEGER;
  v_date    DATE;
BEGIN
  -- Upsert quota row for this user
  INSERT INTO public.youtube_user_quota (user_id, budget_date, used_today)
  VALUES (p_user_id, CURRENT_DATE, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT daily_budget, used_today, budget_date
  INTO v_budget, v_used, v_date
  FROM public.youtube_user_quota
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Auto-reset if it's a new day
  IF v_date < CURRENT_DATE THEN
    UPDATE public.youtube_user_quota
    SET used_today = 0, budget_date = CURRENT_DATE, updated_at = NOW()
    WHERE user_id = p_user_id;
    v_used := 0;
  END IF;

  IF v_used >= v_budget THEN
    RETURN 'cache_only';
  END IF;

  -- Increment and return ok
  UPDATE public.youtube_user_quota
  SET used_today = used_today + 1, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.yt_check_user_budget(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yt_check_user_budget(UUID) TO authenticated, service_role;

-- ── Cache read/write helpers ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.yt_get_cache(p_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT results_json INTO v_result
  FROM public.youtube_search_cache
  WHERE cache_key = p_key AND expires_at > NOW();

  IF v_result IS NOT NULL THEN
    -- Increment hit counter (fire and forget)
    UPDATE public.youtube_search_cache
    SET hit_count = hit_count + 1
    WHERE cache_key = p_key;
  END IF;

  RETURN v_result; -- NULL = cache miss
END;
$$;

CREATE OR REPLACE FUNCTION public.yt_set_cache(
  p_key     TEXT,
  p_query   TEXT,
  p_type    TEXT,
  p_results JSONB,
  p_ttl_hours INTEGER DEFAULT 6
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.youtube_search_cache
    (cache_key, query, type, results_json, expires_at)
  VALUES
    (p_key, p_query, p_type, p_results, NOW() + (p_ttl_hours || ' hours')::INTERVAL)
  ON CONFLICT (cache_key) DO UPDATE
    SET results_json = EXCLUDED.results_json,
        expires_at   = EXCLUDED.expires_at,
        hit_count    = 0,
        created_at   = NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.yt_get_cache(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.yt_set_cache(TEXT, TEXT, TEXT, JSONB, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yt_get_cache(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.yt_set_cache(TEXT, TEXT, TEXT, JSONB, INTEGER) TO service_role;

-- ── Purge expired cache entries (run daily via cron) ──────────────────────────

CREATE OR REPLACE FUNCTION public.yt_purge_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  DELETE FROM public.youtube_search_cache WHERE expires_at <= NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.yt_purge_expired_cache() TO service_role;

-- ── Add cache_hit column to the search log (must exist before stats function) ─
ALTER TABLE public.youtube_search_log
  ADD COLUMN IF NOT EXISTS cache_hit BOOLEAN NOT NULL DEFAULT false;

-- ── Update stats function to include cache metrics ────────────────────────────

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
  WITH log_today AS (
    SELECT success, cache_hit, user_id
    FROM public.youtube_search_log
    WHERE created_at >= CURRENT_DATE::TIMESTAMPTZ
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

-- ── Cron schedule hints (run in Supabase SQL editor) ─────────────────────────
-- SELECT cron.schedule('reset-youtube-keys',  '0 0 * * *', 'SELECT public.reset_youtube_key_counts()');
-- SELECT cron.schedule('purge-youtube-cache', '0 1 * * *', 'SELECT public.yt_purge_expired_cache()');
