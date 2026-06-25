-- Restore stock qty when an order is deleted.
-- Simply adds qty back — no clamp needed (can't oversell by restoring).
CREATE OR REPLACE FUNCTION public.restore_stock_item(p_items JSONB)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.products
    SET stock_qty = stock_qty + (item->>'qty')::integer
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_stock_item(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_stock_item(jsonb) TO authenticated;
