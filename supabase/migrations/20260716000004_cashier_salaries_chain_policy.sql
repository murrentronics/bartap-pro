-- Allow chain owners to manage cashier_salaries for their bar sub-accounts
-- Uses the same is_chain_bar_of() helper used by every other table.
CREATE POLICY "Chain owner manages cashier salaries"
  ON public.cashier_salaries FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));
