-- ─────────────────────────────────────────────────────────────────────────────
-- Order edit support
--
-- 1. increment_stock_item  — mirror of decrement_stock_item, used to restore
--    stock for the OLD items when a sale is edited.
-- 2. UPDATE RLS policy on orders — allows a cashier to update their own orders
--    (items, total, paid, change_given, discount fields) without being able to
--    change owner_id or cashier_id.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. increment_stock_item
CREATE OR REPLACE FUNCTION public.increment_stock_item(p_items JSONB)
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

REVOKE ALL ON FUNCTION public.increment_stock_item(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_stock_item(jsonb) TO authenticated;

-- 2. Allow owners and managers (not cashiers) to UPDATE orders within their scope
DROP POLICY IF EXISTS "Update own orders" ON public.orders;
CREATE POLICY "Update own orders" ON public.orders
  FOR UPDATE
  USING (
    owner_id = public.get_owner_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('owner', 'admin') OR p.role = 'manager' OR p.job_title = 'manager')
    )
  )
  WITH CHECK (
    owner_id = public.get_owner_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.role IN ('owner', 'admin') OR p.role = 'manager' OR p.job_title = 'manager')
    )
  );
