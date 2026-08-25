-- Fix manager transfer note to include manager name

CREATE OR REPLACE FUNCTION public.transfer_manager_to_owner(_manager_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bal      NUMERIC;
  _parent   UUID;
  _username TEXT;
  _caller   UUID := auth.uid();
BEGIN
  SELECT wallet_balance, parent_id, username
    INTO _bal, _parent, _username
    FROM public.profiles
   WHERE id = _manager_id;
  IF _parent IS NULL OR _parent <> _caller THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _bal <> 0 THEN
    UPDATE public.profiles SET wallet_balance = 0 WHERE id = _manager_id;
    IF _bal > 0 THEN
      UPDATE public.profiles SET wallet_balance = wallet_balance + _bal WHERE id = _parent;
    END IF;
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
      VALUES (_manager_id, -_bal, 'transfer_out', 'Cleared to owner');
    IF _bal > 0 THEN
      INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
        VALUES (_parent, _bal, 'transfer_in', 'Cleared from manager: ' || _username);
    END IF;
  END IF;
END;
$$;
