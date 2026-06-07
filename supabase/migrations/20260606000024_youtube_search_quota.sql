-- ─── YouTube search quota stored per account ─────────────────────────────────
-- Replaces localStorage so quota persists across installs and devices.

CREATE TABLE public.youtube_search_quota (
  owner_id   UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  count      INTEGER NOT NULL DEFAULT 0,
  quota_date DATE    NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_search_quota ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own quota" ON public.youtube_search_quota
  FOR ALL USING (owner_id = auth.uid());

-- RPC: increment quota count, auto-resets if date has changed
-- Returns the new count so the client knows remaining searches.
CREATE OR REPLACE FUNCTION public.increment_search_quota(p_owner_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_date  DATE;
BEGIN
  SELECT count, quota_date INTO v_count, v_date
    FROM public.youtube_search_quota
   WHERE owner_id = p_owner_id;

  IF NOT FOUND THEN
    -- First ever search
    INSERT INTO public.youtube_search_quota (owner_id, count, quota_date)
    VALUES (p_owner_id, 1, CURRENT_DATE);
    RETURN 1;
  END IF;

  IF v_date < CURRENT_DATE THEN
    -- New day — reset to 1
    UPDATE public.youtube_search_quota
       SET count = 1, quota_date = CURRENT_DATE, updated_at = now()
     WHERE owner_id = p_owner_id;
    RETURN 1;
  END IF;

  -- Same day — increment
  UPDATE public.youtube_search_quota
     SET count = count + 1, updated_at = now()
   WHERE owner_id = p_owner_id;
  RETURN v_count + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_search_quota(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_search_quota(UUID) TO authenticated;

-- RPC: decrement quota count (refund on failed search)
CREATE OR REPLACE FUNCTION public.decrement_search_quota(p_owner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.youtube_search_quota
     SET count = GREATEST(0, count - 1), updated_at = now()
   WHERE owner_id = p_owner_id AND quota_date = CURRENT_DATE;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_search_quota(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_search_quota(UUID) TO authenticated;

-- RPC: get current quota for today
CREATE OR REPLACE FUNCTION public.get_search_quota(p_owner_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_date  DATE;
BEGIN
  SELECT count, quota_date INTO v_count, v_date
    FROM public.youtube_search_quota
   WHERE owner_id = p_owner_id;

  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_date < CURRENT_DATE THEN RETURN 0; END IF; -- new day, effectively 0
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_search_quota(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_search_quota(UUID) TO authenticated;
