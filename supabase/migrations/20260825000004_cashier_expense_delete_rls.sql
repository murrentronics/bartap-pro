-- Allow cashiers to DELETE their own expense records on owner_expenses.
-- Condition: owner_id must be the cashier's parent owner.

DROP POLICY IF EXISTS "owner_expenses_cashier_delete" ON public.owner_expenses;
CREATE POLICY "owner_expenses_cashier_delete" ON public.owner_expenses
  FOR DELETE USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );
