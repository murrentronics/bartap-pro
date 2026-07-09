-- Chain RPC fixes: proper grants + updated get_chain_bars
-- create_bar_account is handled by the create-bar edge function (service role)
-- so it is NOT defined here as an RPC.

-- ── Drop old versions first ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_bar_account(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.delete_bar_account(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_chain_bars(uuid);
DROP FUNCTION IF EXISTS public.update_bar_account(uuid, uuid, text, text, boolean);

-- ── get_chain_bars ────────────────────────────────────────────────────────────
-- Returns master's own bar (bar 1) + all sub-accounts ordered by created_at
CREATE OR REPLACE FUNCTION public.get_chain_bars(p_owner_id UUID)
RETURNS TABLE (
  id            UUID,
  bar_name      TEXT,
  bar_location  TEXT,
  has_machines  BOOLEAN,
  bar_number    INTEGER,
  created_at    TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username                               AS bar_name,
    COALESCE(p.address, '')                  AS bar_location,
    COALESCE(p.machines_addon_active, false) AS has_machines,
    ROW_NUMBER() OVER (ORDER BY p.created_at)::INTEGER AS bar_number,
    p.created_at
  FROM public.profiles p
  WHERE
    p.id = p_owner_id
    OR (p.parent_id = p_owner_id AND p.is_bar_account = true)
  ORDER BY p.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_chain_bars(uuid) TO authenticated;

-- ── delete_bar_account ────────────────────────────────────────────────────────
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
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_bar_id
      AND parent_id = p_owner_id
      AND is_bar_account = true
  ) THEN
    RAISE EXCEPTION 'Bar not found or not owned by caller';
  END IF;

  DELETE FROM auth.users WHERE id = p_bar_id;

  UPDATE public.profiles
  SET chain_bar_count = GREATEST(1, chain_bar_count - 1)
  WHERE id = p_owner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_bar_account(uuid, uuid) TO authenticated;

-- ── update_bar_account ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_bar_account(
  p_bar_id       UUID,
  p_owner_id     UUID,
  p_bar_name     TEXT,
  p_location     TEXT,
  p_has_machines BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
  SET
    username              = p_bar_name,
    address               = p_location,
    machines_addon_active = p_has_machines
  WHERE id = p_bar_id
    AND parent_id = p_owner_id
    AND is_bar_account = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bar_account(uuid, uuid, text, text, boolean) TO authenticated;

-- ── Fix chain_bar_count for existing chain owners ─────────────────────────────
UPDATE public.profiles AS master
SET chain_bar_count = 1 + COALESCE((
  SELECT COUNT(*)::INTEGER
  FROM public.profiles sub
  WHERE sub.parent_id = master.id
    AND sub.is_bar_account = true
), 0)
WHERE master.plan_type = 'chain';
