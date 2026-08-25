-- Atomic cashier expense refund: refund to cashier wallet first, then owner float
-- Used when a cashier deletes or edits down their own expense
-- Reads the original split from the most recent wallet expense transactions
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
  _wallet_tx_amount NUMERIC;
  _float_tx_amount NUMERIC;
BEGIN
  SELECT wallet_balance INTO _wallet_balance
  FROM public.profiles
  WHERE id = _cashier_id
  FOR UPDATE;

  SELECT cashier_float INTO _cashier_float
  FROM public.profiles
  WHERE id = _owner_id
  FOR UPDATE;

  -- Find the original split from the most recent expense wallet transactions
  SELECT ABS(amount) INTO _wallet_tx_amount
  FROM public.wallet_transactions
  WHERE profile_id = _cashier_id
    AND type = 'cashier_expense'
    AND note = 'Expense from wallet'
    AND amount < 0
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT ABS(amount) INTO _float_tx_amount
  FROM public.wallet_transactions
  WHERE profile_id = _cashier_id
    AND type = 'cashier_expense'
    AND note = 'Expense from float'
    AND amount < 0
  ORDER BY created_at DESC
  LIMIT 1;

  _wallet_covers := COALESCE(_wallet_tx_amount, 0);
  _float_covers := COALESCE(_float_tx_amount, 0);

  -- Fallback: if the found split doesn't match the expense amount, refund full amount to float
  IF _wallet_covers + _float_covers <> _amount THEN
    _float_covers := _amount;
    _wallet_covers := 0;
  END IF;

  -- Refund to cashier wallet
  IF _wallet_covers > 0 THEN
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + _wallet_covers
    WHERE id = _cashier_id;

    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (_cashier_id, _wallet_covers, 'cashier_expense', 'Expense refund to wallet');
  END IF;

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
