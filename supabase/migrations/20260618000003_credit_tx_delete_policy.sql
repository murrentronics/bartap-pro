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
DECLARE
  v_new_balance NUMERIC;
BEGIN
  v_new_balance := GREATEST(0, (
    SELECT balance_owed FROM public.credit_accounts WHERE id = p_credit_account_id
  ) - p_amount);

  UPDATE public.credit_accounts
  SET
    balance_owed = v_new_balance,
    status       = CASE WHEN v_new_balance <= 0 THEN 'closed' ELSE status END,
    updated_at   = now()
  WHERE id = p_credit_account_id;
END;
$$;
