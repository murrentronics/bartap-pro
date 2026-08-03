-- ─────────────────────────────────────────────────────────────────────────────
-- Fix delete_bar_account: re-count sub-bars from DB after deletion instead of
-- decrementing a cached counter. Mirrors how create-addon-bars counts on insert.
-- Also removes the GREATEST floor so counts can reach 0 correctly.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_bar_account(
  p_bar_id   UUID,
  p_owner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id   UUID := auth.uid();
  v_plan_type   TEXT;
  v_new_count   INTEGER;
BEGIN
  -- Auth check
  IF v_caller_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Bar must exist, belong to this owner, and be a sub-account
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_bar_id
      AND parent_id = p_owner_id
      AND is_bar_account = true
  ) THEN
    RAISE EXCEPTION 'Bar not found or not owned by caller';
  END IF;

  -- Fetch owner plan type
  SELECT plan_type INTO v_plan_type
    FROM public.profiles WHERE id = p_owner_id;

  -- Delete the bar (cascades to profile via auth.users FK)
  DELETE FROM auth.users WHERE id = p_bar_id;

  -- Re-count remaining sub-bars from DB (accurate regardless of cached counters)
  SELECT COUNT(*)::INTEGER INTO v_new_count
    FROM public.profiles
   WHERE parent_id = p_owner_id
     AND is_bar_account = true;

  -- Update the right counter based on plan type
  IF v_plan_type = 'chain' THEN
    UPDATE public.profiles
       SET chain_bar_count = v_new_count,
           is_multi_bar    = (v_new_count > 0)
     WHERE id = p_owner_id;
  ELSE
    UPDATE public.profiles
       SET addon_bar_count = v_new_count,
           is_multi_bar    = (v_new_count > 0)
     WHERE id = p_owner_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_bar_account(uuid, uuid) TO authenticated;
