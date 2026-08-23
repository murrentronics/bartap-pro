-- Allow owner to delete stock count tables for their staff before copying new ones

CREATE POLICY "Owner can delete stock count tables for staff"
ON public.stock_count_tables
FOR DELETE
USING (
  auth.uid() = owner_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = profile_id
      AND parent_id = auth.uid()
  )
);
