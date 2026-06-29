-- Allow a cashier to delete the owner's wallet_transactions of type 'credit_charge'
-- so when a cashier removes a credit charge, the owner's read-only wallet record is also removed.

CREATE POLICY "cashier_delete_owner_credit_charge_wallet"
  ON public.wallet_transactions
  FOR DELETE
  USING (
    type = 'credit_charge'
    AND profile_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );
