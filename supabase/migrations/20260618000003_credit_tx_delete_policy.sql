-- Allow owners/cashiers to delete credit_transactions in scope
-- Only charge records can be deleted (not payments — payments cleared the debt)
CREATE POLICY "Delete credit transactions in scope"
  ON public.credit_transactions FOR DELETE
  USING (
    owner_id = public.get_owner_id(auth.uid())
    AND type = 'charge'
  );

-- RPC to reduce balance_owed after a charge is deleted
-- Auto-closes the account if balance drops to 0
CREATE OR REPLACE FUNCTION public.reduce_credit_balance(
  p_credit_account_id UUID,
  p_amount            NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.credit_accounts
  SET
    balance_owed = GREATEST(0, balance_owed - p_amount),
    status       = CASE WHEN (balance_owed - p_amount) <= 0 THEN 'closed' ELSE status END,
    updated_at   = now()
  WHERE id = p_credit_account_id;
END;
$$;
