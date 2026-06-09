-- Fix search quota to use Port of Spain timezone (UTC-4) instead of UTC.
-- CURRENT_DATE was resetting at 8pm local time (midnight UTC).
-- Now resets at midnight Port of Spain time.

CREATE OR REPLACE FUNCTION public.increment_search_quota(p_owner_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_date  DATE;
  v_today DATE;
BEGIN
  v_today := (NOW() AT TIME ZONE 'America/Port_of_Spain')::DATE;

  SELECT count, quota_date INTO v_count, v_date
    FROM public.youtube_search_quota
   WHERE owner_id = p_owner_id;

  IF NOT FOUND THEN
    INSERT INTO public.youtube_search_quota (owner_id, count, quota_date)
    VALUES (p_owner_id, 1, v_today);
    RETURN 1;
  END IF;

  IF v_date < v_today THEN
    UPDATE public.youtube_search_quota
       SET count = 1, quota_date = v_today, updated_at = now()
     WHERE owner_id = p_owner_id;
    RETURN 1;
  END IF;

  UPDATE public.youtube_search_quota
     SET count = count + 1, updated_at = now()
   WHERE owner_id = p_owner_id;
  RETURN v_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_search_quota(p_owner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.youtube_search_quota
     SET count = GREATEST(0, count - 1), updated_at = now()
   WHERE owner_id = p_owner_id
     AND quota_date = (NOW() AT TIME ZONE 'America/Port_of_Spain')::DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_search_quota(p_owner_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_date  DATE;
  v_today DATE;
BEGIN
  v_today := (NOW() AT TIME ZONE 'America/Port_of_Spain')::DATE;

  SELECT count, quota_date INTO v_count, v_date
    FROM public.youtube_search_quota
   WHERE owner_id = p_owner_id;

  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_date < v_today THEN RETURN 0; END IF;
  RETURN v_count;
END;
$$;
