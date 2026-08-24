-- The simplest possible policy — covers owner, manager, and cashier in one line.
-- cashier_id = auth.uid() means any user can always read orders they placed.
-- owner_id = get_owner_id(auth.uid()) means owners can read all orders on their bar.
-- The two together cover every case with no subquery, no enum cast, no parent_id lookup.

DROP POLICY IF EXISTS "View orders in scope" ON public.orders;

CREATE POLICY "View orders in scope" ON public.orders
  FOR SELECT
  USING (
    owner_id = public.get_owner_id(auth.uid())
    OR
    cashier_id = auth.uid()
  );
