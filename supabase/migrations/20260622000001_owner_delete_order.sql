-- Allow the owner to delete their own orders (for correcting mistakes)
CREATE POLICY "Owner deletes own orders"
  ON public.orders FOR DELETE
  USING (owner_id = auth.uid());

-- Also allow the owner to delete wallet_transactions linked to those orders
-- (the 'sale' type tx sits on the cashier profile, but owner needs to clean it up)
CREATE POLICY "Owner deletes own wallet transactions"
  ON public.wallet_transactions FOR DELETE
  USING (
    profile_id = auth.uid()
    OR profile_id IN (
      SELECT id FROM public.profiles WHERE parent_id = auth.uid()
    )
  );
