-- Atomically decrement stock_qty for all items in a sale.
-- SECURITY DEFINER so cashiers (who can't UPDATE products directly) can call it.
-- Clamps at 0 — never goes negative.
--
-- p_items: JSONB array of {id: uuid, qty: int}
-- Example: '[{"id":"abc-123","qty":2},{"id":"def-456","qty":1}]'
CREATE OR REPLACE FUNCTION public.decrement_stock_item(p_items JSONB)
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
    SET stock_qty = GREATEST(0, stock_qty - (item->>'qty')::integer)
    WHERE id = (item->>'id')::uuid;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_stock_item(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decrement_stock_item(jsonb) TO authenticated;
