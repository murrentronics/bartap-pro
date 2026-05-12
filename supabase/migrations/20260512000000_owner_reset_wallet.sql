-- Creates a SECURITY DEFINER function so the owner can reset their wallet
-- without needing a direct INSERT policy on wallet_transactions.

CREATE OR REPLACE FUNCTION public.owner_reset_wallet(
  _owner_id UUID,
  _prev_balance NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the owner themselves can call this
  IF _owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Must actually be an owner role
  IF NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Zero out the balance
  UPDATE public.profiles
  SET wallet_balance = 0
  WHERE id = _owner_id;

  -- Record the reset transaction
  INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
  VALUES (
    _owner_id,
    -_prev_balance,
    'wallet_reset',
    'Wallet balance reset from $' || _prev_balance::text || ' to $0.00'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.owner_reset_wallet(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_reset_wallet(UUID, NUMERIC) TO authenticated;
