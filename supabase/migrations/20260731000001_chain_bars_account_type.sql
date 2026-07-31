-- Add is_machines_account and plan_type to get_chain_bars RPC
-- so the Switch Bar UI can show the correct account type label.

DROP FUNCTION IF EXISTS public.get_chain_bars(uuid);

CREATE OR REPLACE FUNCTION public.get_chain_bars(p_owner_id UUID)
RETURNS TABLE (
  id                   UUID,
  bar_name             TEXT,
  bar_location         TEXT,
  has_machines         BOOLEAN,
  is_machines_account  BOOLEAN,
  bar_number           INTEGER,
  created_at           TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username                                          AS bar_name,
    COALESCE(p.address, '')                             AS bar_location,
    COALESCE(p.machines_addon_active, false)
      OR p.plan_type = 'machines_only'                  AS has_machines,
    COALESCE(p.is_machines_account, false)
      OR p.plan_type = 'machines_only'                  AS is_machines_account,
    ROW_NUMBER() OVER (ORDER BY p.created_at)::INTEGER  AS bar_number,
    p.created_at
  FROM public.profiles p
  WHERE
    p.id = p_owner_id
    OR (p.parent_id = p_owner_id AND p.is_bar_account = true)
  ORDER BY p.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_chain_bars(uuid) TO authenticated;
