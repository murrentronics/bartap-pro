-- Replace the broken RLS-based delete with a SECURITY DEFINER RPC.
-- This bypasses RLS entirely so it works for direct owners AND chain masters.

CREATE OR REPLACE FUNCTION public.copy_stock_count_tables_to_staff(
  p_owner_id  UUID,
  p_staff_ids UUID[],
  p_tables    JSONB  -- array of {name, columns, rows}
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1. Wipe every existing table for the selected staff under this owner
  DELETE FROM public.stock_count_tables
  WHERE owner_id = p_owner_id
    AND profile_id = ANY(p_staff_ids);

  -- 2. Insert a fresh copy of each owner table for each staff member
  INSERT INTO public.stock_count_tables (id, profile_id, owner_id, name, columns, rows, created_at, updated_at)
  SELECT
    gen_random_uuid(),
    staff_id,
    p_owner_id,
    (tbl->>'name'),
    (tbl->'columns'),
    (tbl->'rows'),
    now(),
    now()
  FROM
    unnest(p_staff_ids) AS staff_id,
    jsonb_array_elements(p_tables) AS tbl;
END;
$$;

GRANT EXECUTE ON FUNCTION public.copy_stock_count_tables_to_staff(UUID, UUID[], JSONB) TO authenticated;
