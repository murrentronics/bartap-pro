-- Allow owner to copy stock count tables to staff profiles

CREATE POLICY "Owner can insert stock count tables for staff"
ON public.stock_count_tables
FOR INSERT
WITH CHECK (
  auth.uid() = owner_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = profile_id
      AND parent_id = auth.uid()
  )
);
