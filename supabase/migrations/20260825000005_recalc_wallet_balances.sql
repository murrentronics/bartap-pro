-- Fix wallet_balance for all profiles by recalculating from wallet_transactions
-- Run this after any order edit/delete bugs to sync wallet balances

CREATE OR REPLACE FUNCTION public.recalc_wallet_balances()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _profile RECORD;
BEGIN
  FOR _profile IN SELECT id FROM public.profiles LOOP
    UPDATE public.profiles p
    SET wallet_balance = COALESCE((
      SELECT SUM(amount)
      FROM public.wallet_transactions
      WHERE profile_id = p.id
    ), 0)
    WHERE p.id = _profile.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_wallet_balances() TO authenticated;
