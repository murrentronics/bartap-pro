-- Atomic manager expense refund: float first, then wallet
-- Used when editing down an expense or deleting an expense
CREATE OR REPLACE FUNCTION public.refund_manager_expense(
  _manager_id UUID,
  _owner_id UUID,
  _amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cashier_float NUMERIC;
  _wallet_balance NUMERIC;
  _float_covers NUMERIC;
  _wallet_covers NUMERIC;
BEGIN
  SELECT cashier_float INTO _cashier_float
  FROM public.profiles
  WHERE id = _owner_id
  FOR UPDATE;

  SELECT wallet_balance INTO _wallet_balance
  FROM public.profiles
  WHERE id = _manager_id
  FOR UPDATE;

  -- Float covers first (restore float), wallet covers remainder
  _float_covers := LEAST(_cashier_float, _amount);
  _wallet_covers := _amount - _float_covers;

  -- 1. Refund to float
  IF _float_covers > 0 THEN
    UPDATE public.profiles
    SET cashier_float = cashier_float + _float_covers
    WHERE id = _owner_id;

    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (_manager_id, _float_covers, 'cashier_expense', 'Refund to float');
  END IF;

  -- 2. Refund remainder to manager wallet
  IF _wallet_covers > 0 THEN
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + _wallet_covers
    WHERE id = _manager_id;

    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (_manager_id, _wallet_covers, 'cashier_expense', 'Refund to wallet');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_manager_expense(UUID, UUID, NUMERIC) TO authenticated;
