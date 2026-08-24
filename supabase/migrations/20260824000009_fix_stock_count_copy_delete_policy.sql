-- Fix: copy-tables-to-staff delete was silently blocked for chain accounts.
-- The old policy only allowed delete when staff parent_id = auth.uid() directly.
-- For chain owners, staff parent_id = bar_account.id, not the master's uid.
-- This policy adds that second level check.

DROP POLICY IF EXISTS "Owner can delete stock count tables for staff" ON public.stock_count_tables;

CREATE POLICY "Owner can delete stock count tables for staff"
ON public.stock_count_tables
FOR DELETE
USING (
  -- Direct owner: staff parent_id = owner uid
  (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = profile_id
        AND parent_id = auth.uid()
    )
  )
  OR
  -- Chain master: staff parent_id = bar_account whose parent_id = master uid
  (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.profiles staff
      JOIN public.profiles bar ON bar.id = staff.parent_id
      WHERE staff.id = profile_id
        AND bar.parent_id = auth.uid()
        AND bar.is_bar_account = true
    )
  )
);

-- Same fix for the INSERT policy so chain masters can copy tables too
DROP POLICY IF EXISTS "Owner can insert stock count tables for staff" ON public.stock_count_tables;

CREATE POLICY "Owner can insert stock count tables for staff"
ON public.stock_count_tables
FOR INSERT
WITH CHECK (
  -- Direct owner
  (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = profile_id
        AND parent_id = auth.uid()
    )
  )
  OR
  -- Chain master
  (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.profiles staff
      JOIN public.profiles bar ON bar.id = staff.parent_id
      WHERE staff.id = profile_id
        AND bar.parent_id = auth.uid()
        AND bar.is_bar_account = true
    )
  )
);
