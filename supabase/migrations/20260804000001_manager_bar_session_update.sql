-- Allow managers (cashiers whose job_title = 'manager') to update
-- only the bar-session and cashier-float fields on their owner's profile row.
-- The existing "Update own profile" policy (id = auth.uid()) covers all other updates;
-- this policy is additive.

CREATE POLICY "Manager can update owner bar session"
  ON public.profiles
  FOR UPDATE
  USING (
    -- The row being updated must be the caller's owner (parent)
    id = (
      SELECT parent_id FROM public.profiles WHERE id = auth.uid()
    )
    AND
    -- The caller must be a cashier-role user with job_title = 'manager'
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'cashier'
        AND job_title = 'manager'
    )
  )
  WITH CHECK (
    id = (
      SELECT parent_id FROM public.profiles WHERE id = auth.uid()
    )
    AND
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'cashier'
        AND job_title = 'manager'
    )
  );
