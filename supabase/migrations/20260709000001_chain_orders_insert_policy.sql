-- Chain owners need to insert orders where owner_id = one of their bar sub-accounts.
-- The existing "Insert orders by self" policy only allows owner_id = get_owner_id(auth.uid())
-- which resolves to the master's own profile — not sub-bar IDs.
-- This new policy allows chain owners to insert orders for any of their bars.

CREATE POLICY "Chain owner inserts bar orders"
  ON public.orders FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid()
    AND public.is_chain_bar_of(auth.uid(), owner_id)
  );
