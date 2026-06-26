-- Cashiers can delete machine_entries they created (for correcting mistakes)
-- Restricted to records where cashier_id = auth.uid() so they can only delete their own entries
CREATE POLICY "cashier_delete_machine_entries"
  ON public.machine_entries FOR DELETE
  USING (
    cashier_id = auth.uid()
    AND owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );

-- Cashiers can delete orders they created (cashier_id = auth.uid())
-- The existing owner policy only covers owner_id = auth.uid() which blocks cashiers
CREATE POLICY "cashier_delete_own_orders"
  ON public.orders FOR DELETE
  USING (
    cashier_id = auth.uid()
  );
