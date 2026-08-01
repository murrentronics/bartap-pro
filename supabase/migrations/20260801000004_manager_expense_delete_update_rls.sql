-- Allow managers to UPDATE and DELETE their own expense records on owner_expenses.
-- Condition: owner_id must be the manager's parent owner.

DROP POLICY IF EXISTS "owner_expenses_manager_update" ON public.owner_expenses;
CREATE POLICY "owner_expenses_manager_update" ON public.owner_expenses
  FOR UPDATE USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "owner_expenses_manager_delete" ON public.owner_expenses;
CREATE POLICY "owner_expenses_manager_delete" ON public.owner_expenses
  FOR DELETE USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );
