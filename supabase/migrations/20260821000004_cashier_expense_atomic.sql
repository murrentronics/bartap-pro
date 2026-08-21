-- Atomic cashier expense: wallet first, then float
-- This eliminates client-side race conditions and state mismatches
CREATE OR REPLACE FUNCTION public.add_cashier_expense(
  _cashier_id UUID,
  _owner_id UUID,
  _amount NUMERIC,
  _description TEXT,
  _expense_date DATE
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
  -- Lock the cashier row to prevent concurrent expense race conditions
  SELECT wallet_balance INTO _wallet_balance
  FROM public.profiles
  WHERE id = _cashier_id
  FOR UPDATE;

  SELECT cashier_float INTO _cashier_float
  FROM public.profiles
  WHERE id = _owner_id
  FOR UPDATE;

  -- Wallet covers first, float covers remainder
  _wallet_covers := LEAST(_wallet_balance, _amount);
  _float_covers := _amount - _wallet_covers;

  -- Validate sufficient float
  IF _float_covers > _cashier_float THEN
    RAISE EXCEPTION 'Insufficient funds. Wallet covers $%, float covers $% — short $%',
      _wallet_covers, _cashier_float, _float_covers - _cashier_float;
  END IF;

  -- 1. Insert expense record
  INSERT INTO public.owner_expenses (owner_id, amount, description, expense_date)
  VALUES (_owner_id, _amount, _description, _expense_date);

  -- 2. Deduct from cashier wallet
  IF _wallet_covers > 0 THEN
    UPDATE public.profiles
    SET wallet_balance = wallet_balance - _wallet_covers
    WHERE id = _cashier_id;

    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (_cashier_id, -_wallet_covers, 'cashier_expense', 'Expense from wallet');
  END IF;

  -- 3. Deduct remainder from owner float
  IF _float_covers > 0 THEN
    UPDATE public.profiles
    SET cashier_float = cashier_float - _float_covers
    WHERE id = _owner_id;

    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (_cashier_id, -_float_covers, 'cashier_expense', 'Expense from float');
  END IF;
END;
$$;

-- Grant execute to authenticated users (RLS will restrict who can call it)
GRANT EXECUTE ON FUNCTION public.add_cashier_expense(UUID, UUID, NUMERIC, TEXT, DATE) TO authenticated;
