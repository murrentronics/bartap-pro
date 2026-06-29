-- Simple SECURITY DEFINER function to delete wallet_transactions rows
-- for a credit charge. Called by the client after delete_credit_charge succeeds.
-- Runs as SECURITY DEFINER so it can delete the owner's row even when called by a cashier.

CREATE OR REPLACE FUNCTION public.delete_credit_charge_wallet_rows(
  p_owner_id   UUID,
  p_cashier_id UUID,
  p_from_time  TIMESTAMPTZ,
  p_to_time    TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  DELETE FROM public.wallet_transactions
   WHERE type = 'credit_charge'
     AND profile_id IN (p_owner_id, p_cashier_id)
     AND created_at BETWEEN p_from_time AND p_to_time;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_credit_charge_wallet_rows(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
