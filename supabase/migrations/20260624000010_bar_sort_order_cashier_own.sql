-- Each user (owner OR cashier) stores their own bar sort order.
-- Drop the old policies and replace with a single "manage your own row" policy.

DROP POLICY IF EXISTS "owner_manage_bar_sort" ON public.bar_sort_order;
DROP POLICY IF EXISTS "cashier_read_bar_sort" ON public.bar_sort_order;

-- Every authenticated user can read/write their own row (keyed by profile.id)
CREATE POLICY "user_manage_own_bar_sort"
  ON public.bar_sort_order FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
