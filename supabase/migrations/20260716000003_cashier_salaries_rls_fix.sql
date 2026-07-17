-- Ensure RLS is enabled
ALTER TABLE public.cashier_salaries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (clean slate)
DROP POLICY IF EXISTS "cashier_salaries_owner_select" ON public.cashier_salaries;
DROP POLICY IF EXISTS "cashier_salaries_owner_insert" ON public.cashier_salaries;
DROP POLICY IF EXISTS "cashier_salaries_owner_update" ON public.cashier_salaries;
DROP POLICY IF EXISTS "cashier_salaries_owner_delete" ON public.cashier_salaries;

-- Recreate all four policies
CREATE POLICY "cashier_salaries_owner_select" ON public.cashier_salaries
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "cashier_salaries_owner_insert" ON public.cashier_salaries
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "cashier_salaries_owner_update" ON public.cashier_salaries
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "cashier_salaries_owner_delete" ON public.cashier_salaries
  FOR DELETE USING (owner_id = auth.uid());
