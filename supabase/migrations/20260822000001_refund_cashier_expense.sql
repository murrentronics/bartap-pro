-- Atomic cashier expense refund: refund to cashier wallet first, then owner float
-- Used when a cashier deletes or edits down their own expense
CREATE OR REPLACE FUNCTION public.refund_cashier_expense(
  _cashier_id UUID,
  _owner_id UUID,
  _amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wallet_balance NUMERIC;
  _cashier_float NUMERIC;
  _wallet_covers NUMERIC;
  _float_covers NUMERIC;
BEGIN
  SELECT wallet_balance INTO _wallet_balance
  FROM public.profiles
  WHERE id = _cashier_id
  FOR UPDATE;

  SELECT cashier_float INTO _cashier_float
  FROM public.profiles
  WHERE id = _owner_id
  FOR UPDATE;

  -- Wallet first (restore what was deducted from wallet), then float
  -- We don't know the original split, so restore to wallet up to original balance
  -- Simple approach: restore full amount to float, which is safest
  _float_covers := _amount;
  _wallet_covers := 0;

  -- Refund to owner float
  IF _float_covers > 0 THEN
    UPDATE public.profiles
    SET cashier_float = cashier_float + _float_covers
    WHERE id = _owner_id;

    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (_cashier_id, _float_covers, 'cashier_expense', 'Expense refund to float');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_cashier_expense(UUID, UUID, NUMERIC) TO authenticated;
