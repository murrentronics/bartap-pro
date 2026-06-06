-- ─────────────────────────────────────────────────────────────────────────────
-- YouTube API Key Pool — rotation + usage tracking
-- ─────────────────────────────────────────────────────────────────────────────

-- Table: youtube_api_keys
-- Stores each API key slot. Keys are stored in Supabase secrets as
-- YOUTUBE_API_KEY_1 .. YOUTUBE_API_KEY_10.  This table tracks usage only —
-- the actual key string is NEVER stored here (stays in Vault/secrets).
CREATE TABLE IF NOT EXISTS public.youtube_api_keys (
  slot          INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 10),
  label         TEXT    NOT NULL DEFAULT '',      -- friendly name, e.g. "Account A"
  enabled       BOOLEAN NOT NULL DEFAULT true,    -- admin can disable a slot
  daily_limit   INTEGER NOT NULL DEFAULT 9800,    -- conservative limit (real quota is 10 000)
  used_today    INTEGER NOT NULL DEFAULT 0,
  exhausted     BOOLEAN NOT NULL DEFAULT false,   -- true when used_today >= daily_limit
  last_used_at  TIMESTAMPTZ,
  reset_at      TIMESTAMPTZ,                      -- when counts were last zeroed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed slots 1-10 (disabled by default — admin enables them once keys are set)
INSERT INTO public.youtube_api_keys (slot, label, enabled)
VALUES
  (1,  'Key Slot 1',  false),
  (2,  'Key Slot 2',  false),
  (3,  'Key Slot 3',  false),
  (4,  'Key Slot 4',  false),
  (5,  'Key Slot 5',  false),
  (6,  'Key Slot 6',  false),
  (7,  'Key Slot 7',  false),
  (8,  'Key Slot 8',  false),
  (9,  'Key Slot 9',  false),
  (10, 'Key Slot 10', false)
ON CONFLICT (slot) DO NOTHING;

-- Table: youtube_search_log
-- One row per search call. Key slot is recorded but never the key value itself.
CREATE TABLE IF NOT EXISTS public.youtube_search_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  query      TEXT        NOT NULL,
  type       TEXT        NOT NULL DEFAULT 'video',
  key_slot   INTEGER     REFERENCES public.youtube_api_keys(slot) ON DELETE SET NULL,
  success    BOOLEAN     NOT NULL DEFAULT true,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_yt_search_log_created  ON public.youtube_search_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yt_search_log_user     ON public.youtube_search_log(user_id);
CREATE INDEX IF NOT EXISTS idx_yt_search_log_key_slot ON public.youtube_search_log(key_slot);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.youtube_api_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.youtube_search_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write the key pool table
CREATE POLICY "Admins can manage api keys"
  ON public.youtube_api_keys FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Edge functions (service role) can also write to the key table — handled via service role bypass

-- Admins can view all logs; owners can view their own
CREATE POLICY "Admins can view all search logs"
  ON public.youtube_search_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can view own search logs"
  ON public.youtube_search_log FOR SELECT
  USING (user_id = auth.uid());

-- ─── Daily reset function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_youtube_key_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.youtube_api_keys
  SET used_today   = 0,
      exhausted    = false,
      reset_at     = NOW()
  WHERE true;
END;
$$;

-- Schedule daily reset at midnight UTC
-- Run in Supabase SQL editor or cron:
-- SELECT cron.schedule('reset-youtube-keys', '0 0 * * *', 'SELECT public.reset_youtube_key_counts()');

-- ─── Admin stats function (SECURITY INVOKER — runs as the calling user) ───────
-- Replaces the old SECURITY DEFINER view so RLS is enforced on the caller,
-- not the view creator. Only admins can read youtube_api_keys/search_log anyway.

CREATE OR REPLACE FUNCTION public.get_youtube_daily_stats()
RETURNS TABLE (
  searches_today     BIGINT,
  successful_today   BIGINT,
  failed_today       BIGINT,
  quota_used_today   NUMERIC,
  quota_remaining    NUMERIC,
  active_keys        BIGINT,
  total_keys         BIGINT,
  unique_users_today BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)           FROM public.youtube_search_log
     WHERE created_at >= CURRENT_DATE::TIMESTAMPTZ)::BIGINT,

    (SELECT COUNT(*)           FROM public.youtube_search_log
     WHERE created_at >= CURRENT_DATE::TIMESTAMPTZ AND success = true)::BIGINT,

    (SELECT COUNT(*)           FROM public.youtube_search_log
     WHERE created_at >= CURRENT_DATE::TIMESTAMPTZ AND success = false)::BIGINT,

    (SELECT COALESCE(SUM(used_today), 0)
     FROM public.youtube_api_keys WHERE enabled = true),

    (SELECT COALESCE(SUM(daily_limit - used_today), 0)
     FROM public.youtube_api_keys WHERE enabled = true AND NOT exhausted),

    (SELECT COUNT(*) FROM public.youtube_api_keys WHERE enabled = true AND NOT exhausted)::BIGINT,
    (SELECT COUNT(*) FROM public.youtube_api_keys WHERE enabled = true)::BIGINT,

    (SELECT COUNT(DISTINCT user_id) FROM public.youtube_search_log
     WHERE created_at >= CURRENT_DATE::TIMESTAMPTZ)::BIGINT;
$$;

REVOKE ALL ON FUNCTION public.get_youtube_daily_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_youtube_daily_stats() TO authenticated;

-- ─── Helper: get next available key slot ──────────────────────────────────────
-- Called by the edge function via RPC to atomically pick + increment a slot.

CREATE OR REPLACE FUNCTION public.yt_claim_key_slot()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_slot INTEGER;
BEGIN
  -- Lock and select lowest-numbered enabled, non-exhausted slot
  SELECT slot INTO v_slot
  FROM public.youtube_api_keys
  WHERE enabled = true AND NOT exhausted
  ORDER BY slot ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_slot IS NULL THEN
    RETURN NULL; -- all keys exhausted
  END IF;

  -- Increment usage counter; mark exhausted if at limit
  UPDATE public.youtube_api_keys
  SET used_today   = used_today + 1,
      last_used_at = NOW(),
      exhausted    = (used_today + 1 >= daily_limit)
  WHERE slot = v_slot;

  RETURN v_slot;
END;
$$;

REVOKE ALL ON FUNCTION public.yt_claim_key_slot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yt_claim_key_slot() TO authenticated, service_role;

-- ─── Helper: mark slot exhausted (called when Google returns 403/quota error) ─

CREATE OR REPLACE FUNCTION public.yt_exhaust_key_slot(p_slot INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.youtube_api_keys
  SET exhausted = true
  WHERE slot = p_slot;
END;
$$;

REVOKE ALL ON FUNCTION public.yt_exhaust_key_slot(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yt_exhaust_key_slot(INTEGER) TO authenticated, service_role;

-- ─── Log a completed search ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.yt_log_search(
  p_user_id  UUID,
  p_query    TEXT,
  p_type     TEXT,
  p_slot     INTEGER,
  p_success  BOOLEAN,
  p_error    TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.youtube_search_log
    (user_id, query, type, key_slot, success, error_code)
  VALUES
    (p_user_id, p_query, p_type, p_slot, p_success, p_error);
END;
$$;

REVOKE ALL ON FUNCTION public.yt_log_search(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yt_log_search(UUID, TEXT, TEXT, INTEGER, BOOLEAN, TEXT) TO authenticated, service_role;
