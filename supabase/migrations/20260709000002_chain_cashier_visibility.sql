-- Allow chain owner to see cashiers that belong to their bar sub-accounts.
-- These cashiers have parent_id = bar_sub_account_id, not parent_id = master_id,
-- so the existing "View own profile" policy doesn't cover them.
--
-- Uses SECURITY DEFINER function to avoid RLS recursion on profiles table.

CREATE OR REPLACE FUNCTION public.is_chain_bar_owner(_owner_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _owner_id
      AND parent_id = auth.uid()
      AND is_bar_account = true
  );
$$;

-- Cashiers under bar sub-accounts visible to chain master
DROP POLICY IF EXISTS "Chain owner views bar cashiers" ON public.profiles;
CREATE POLICY "Chain owner views bar cashiers"
  ON public.profiles FOR SELECT
  USING (
    public.is_chain_bar_owner(parent_id)
  );

-- Also fix orders INSERT to allow chain owner inserting for a bar sub-account
DROP POLICY IF EXISTS "Insert orders by self" ON public.orders;
CREATE POLICY "Insert orders by self"
  ON public.orders FOR INSERT
  WITH CHECK (
    cashier_id = auth.uid()
    AND (
      owner_id = get_owner_id(auth.uid())
      OR public.is_chain_bar_owner(owner_id)
    )
  );
