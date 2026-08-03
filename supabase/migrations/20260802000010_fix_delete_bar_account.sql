-- ─────────────────────────────────────────────────────────────────────────────
-- Fix delete_bar_account RPC:
--
-- Previous version only decremented chain_bar_count (clamped to min 1) and
-- never touched addon_bar_count or is_multi_bar — so addon-plan owners who
-- deleted a bar never saw their count drop and the billing renewal total stayed
-- inflated.
--
-- New behaviour:
--   • Decrements addon_bar_count (for addon-plan owners: basic, premium, etc.)
--   • Decrements chain_bar_count only for legacy chain owners
--   • Sets is_multi_bar = false when addon_bar_count reaches 0
--   • Removes the GREATEST(1,...) floor — counts can reach 0
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
  v_caller_id    UUID    := auth.uid();
  v_plan_type    TEXT;
  v_addon_count  INTEGER;
  v_chain_count  INTEGER;
  v_new_addon    INTEGER;
  v_new_chain    INTEGER;
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

  -- Fetch owner counters
  SELECT plan_type, addon_bar_count, chain_bar_count
    INTO v_plan_type, v_addon_count, v_chain_count
    FROM public.profiles
   WHERE id = p_owner_id;

  -- Delete the bar's auth user (cascades to profile and all related data)
  DELETE FROM auth.users WHERE id = p_bar_id;

  -- Decrement the right counter based on plan type
  IF v_plan_type = 'chain' THEN
    -- Legacy chain plan: decrement chain_bar_count (can go to 0)
    v_new_chain := GREATEST(0, COALESCE(v_chain_count, 1) - 1);
    UPDATE public.profiles
       SET chain_bar_count = v_new_chain,
           is_multi_bar    = (v_new_chain > 0)
     WHERE id = p_owner_id;
  ELSE
    -- Addon plan (basic, premium, machines_only, etc.): decrement addon_bar_count
    v_new_addon := GREATEST(0, COALESCE(v_addon_count, 1) - 1);
    UPDATE public.profiles
       SET addon_bar_count = v_new_addon,
           is_multi_bar    = (v_new_addon > 0)
     WHERE id = p_owner_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_bar_account(uuid, uuid) TO authenticated;
