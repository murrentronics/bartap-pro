-- ─── RLS policies: manager role can insert/select owner_expenses via parent_id ─
-- Mirrors the existing cashier policies but for the manager role.
-- Wrapped in DO block so it no-ops gracefully if the table doesn't exist yet.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'owner_expenses'
  ) THEN

    DROP POLICY IF EXISTS "owner_expenses_manager_insert" ON public.owner_expenses;
    EXECUTE $policy$
      CREATE POLICY "owner_expenses_manager_insert" ON public.owner_expenses
        FOR INSERT WITH CHECK (
          owner_id IN (
            SELECT parent_id FROM public.profiles
            WHERE id = auth.uid() AND role = 'manager'
          )
        )
    $policy$;

    DROP POLICY IF EXISTS "owner_expenses_manager_select" ON public.owner_expenses;
    EXECUTE $policy$
      CREATE POLICY "owner_expenses_manager_select" ON public.owner_expenses
        FOR SELECT USING (
          owner_id IN (
            SELECT parent_id FROM public.profiles
            WHERE id = auth.uid() AND role = 'manager'
          )
        )
    $policy$;

  END IF;
END;
$$;
