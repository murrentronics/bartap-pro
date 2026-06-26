-- When a cashier closes a bottle, insert a read-only record into the OWNER's
-- wallet_transactions so the owner can see it in their wallet — same pattern
-- as cashier_sale_owner_record. Amount = 0, type = 'bottle_finished'.
-- Also writes the cashier's record as before.
CREATE OR REPLACE FUNCTION public.finish_bottle(
  p_bottle_id  UUID,
  p_cashier_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue      NUMERIC;
  v_name         TEXT;
  v_product_id   UUID;
  v_owner_id     UUID;
  v_bottle_price NUMERIC;
  v_note         TEXT;
  v_cashier_name TEXT;
  v_gain_loss    NUMERIC;
BEGIN
  SELECT revenue, product_name, product_id, owner_id
    INTO v_revenue, v_name, v_product_id, v_owner_id
    FROM public.opened_bottles
   WHERE id = p_bottle_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bottle not found or already finished';
  END IF;

  SELECT price INTO v_bottle_price
    FROM public.products WHERE id = v_product_id;

  SELECT username INTO v_cashier_name
    FROM public.profiles WHERE id = p_cashier_id;

  v_gain_loss := COALESCE(v_revenue, 0) - COALESCE(v_bottle_price, 0);

  v_note := 'Bottle closed: ' || v_name
    || ' | Bottle price: $' || COALESCE(v_bottle_price::text, '?')
    || ' | Shots revenue: $' || COALESCE(v_revenue::text, '0')
    || ' | ' || CASE WHEN v_gain_loss >= 0 THEN 'Gain' ELSE 'Loss' END
    || ': $' || ABS(v_gain_loss)::text;

  UPDATE public.opened_bottles
     SET status      = 'finished',
         finished_at = now()
   WHERE id = p_bottle_id;

  -- Cashier's own record (same as before)
  IF p_cashier_id != v_owner_id THEN
    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (
      p_cashier_id, 0, 'bottle_finished',
      v_note || COALESCE(' | By: ' || v_cashier_name, '')
    );
  END IF;

  -- Owner's read-only record so they always see bottle closes
  INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
  VALUES (
    v_owner_id, 0, 'bottle_finished',
    v_note
      || CASE WHEN p_cashier_id != v_owner_id
              THEN ' | By: ' || COALESCE(v_cashier_name, 'Cashier')
              ELSE '' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_bottle(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_bottle(UUID, UUID) TO authenticated;
