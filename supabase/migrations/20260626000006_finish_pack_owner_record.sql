-- When a cashier (or owner) closes a pack (cigarettes / rolling papers),
-- write a record-only wallet_transaction to BOTH the cashier's wallet AND
-- the owner's wallet — identical to what finish_bottle does.
-- Amount = 0 so balance is unchanged; gain/loss is shown in the note.
CREATE OR REPLACE FUNCTION public.finish_pack(
  p_pack_id    UUID,
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
  v_pack_price   NUMERIC;
  v_pack_type    TEXT;
  v_units        INTEGER;
  v_unit_label   TEXT;
  v_gain_loss    NUMERIC;
  v_cashier_name TEXT;
  v_note         TEXT;
BEGIN
  SELECT revenue, product_name, product_id, owner_id, pack_type, units_sold
    INTO v_revenue, v_name, v_product_id, v_owner_id, v_pack_type, v_units
    FROM public.opened_packs
   WHERE id = p_pack_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pack not found or already finished';
  END IF;

  SELECT price INTO v_pack_price FROM public.products WHERE id = v_product_id;

  SELECT username INTO v_cashier_name FROM public.profiles WHERE id = p_cashier_id;

  v_unit_label := CASE WHEN v_pack_type = 'paper' THEN 'papers' ELSE 'cigarettes' END;

  -- gain/loss = revenue from units sold minus the cost of the pack itself
  v_gain_loss := COALESCE(v_revenue, 0) - COALESCE(v_pack_price, 0);

  -- Build the pipe-separated note — wallet parser reads positional parts:
  --   [0] title  |  [1] Pack price  |  [2] units sold  |  [3] Revenue  |  (opt) By: name
  v_note := 'Pack sold out: ' || v_name
    || ' (' || v_pack_type || ')'
    || ' | Pack price: $'    || COALESCE(v_pack_price::text, '?')
    || ' | '                 || v_units || ' ' || v_unit_label || ' sold'
    || ' | Revenue: $'       || COALESCE(v_revenue::text, '0')
    || ' | '
    || CASE WHEN v_gain_loss >= 0 THEN 'Gain' ELSE 'Loss' END
    || ': $' || ABS(v_gain_loss)::text;

  -- Close the pack
  UPDATE public.opened_packs
     SET status = 'finished', finished_at = now()
   WHERE id = p_pack_id;

  -- Cashier's own record (only when cashier ≠ owner)
  IF p_cashier_id != v_owner_id THEN
    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (
      p_cashier_id, 0, 'pack_finished',
      v_note || ' | By: ' || COALESCE(v_cashier_name, 'Cashier')
    );
  END IF;

  -- Owner's read-only record — always written so owner sees every pack close
  INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
  VALUES (
    v_owner_id, 0, 'pack_finished',
    v_note
      || CASE WHEN p_cashier_id != v_owner_id
              THEN ' | By: ' || COALESCE(v_cashier_name, 'Cashier')
              ELSE '' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_pack(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_pack(UUID, UUID) TO authenticated;
