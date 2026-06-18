-- Allow owners to delete their own credit accounts (cascades to transactions)
DROP POLICY IF EXISTS "Delete credit accounts in scope" ON public.credit_accounts;
CREATE POLICY "Delete credit accounts in scope"
  ON public.credit_accounts FOR DELETE
  USING (owner_id = public.get_owner_id(auth.uid()));
