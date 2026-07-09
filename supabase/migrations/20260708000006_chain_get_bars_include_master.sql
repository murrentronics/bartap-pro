-- Update get_chain_bars to include the master owner's own profile as Bar 1.
-- When an owner upgrades to chain, their existing bar IS bar 1.
-- Sub-accounts (is_bar_account = true) appear as bars 2, 3, etc.
-- bar_number 1 is always the master's own profile (oldest created_at).

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
    -- The master owner themselves (bar 1)
    p.id = p_owner_id
    OR
    -- Any sub-accounts they created
    (p.parent_id = p_owner_id AND p.is_bar_account = true)
  ORDER BY p.created_at;
$$;
