-- Step 1: Check the current live SELECT policy on orders
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'orders' AND schemaname = 'public' AND cmd = 'SELECT';

-- Step 2: Drop old policy and replace with one that explicitly covers managers
DROP POLICY IF EXISTS "View orders in scope" ON public.orders;
DROP POLICY IF EXISTS "Chain owner selects orders" ON public.orders;

CREATE POLICY "View orders in scope" ON public.orders
  FOR SELECT
  USING (
    -- Owner sees all orders on their bar
    owner_id = public.get_owner_id(auth.uid())
    OR
    -- Cashier/manager sees their own orders
    cashier_id = auth.uid()
  );
