-- ─────────────────────────────────────────────────────────────────────────────
-- Update delete_credit_charge to also reverse shot / pack-unit records.
--
-- Credit orders now call record_shot / record_pack_unit at confirm time
-- (same as cash orders), so deleting a credit charge must also reverse those
-- counts — including reopening any bottle/pack that was subsequently marked
-- empty as a result of this sale.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_credit_charge(
  p_credit_tx_id UUID,
  p_cashier_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_credit_account_id UUID;
  v_owner_id          UUID;
  v_amount            NUMERIC;
  v_items             JSONB;
  v_item              JSONB;
  v_new_balance       NUMERIC;
BEGIN
  -- Fetch the charge record
  SELECT credit_account_id, owner_id, amount, items
    INTO v_credit_account_id, v_owner_id, v_amount, v_items
    FROM public.credit_transactions
   WHERE id = p_credit_tx_id AND type = 'charge';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit charge not found';
  END IF;

  -- 1. Reverse shots_sold / units_sold / revenue on any opened bottles or packs
  --    (also reopens any bottle/pack that was marked finished by this sale)
  IF v_items IS NOT NULL THEN
    PERFORM public.reverse_order_shot_pack(v_items);
  END IF;

  -- 2. Restore stock for each item (skip synthetic shot-/pack- ids — those
  --    don't map to products rows, same as the cash-order delete path)
  IF v_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      CONTINUE WHEN (v_item->>'id') LIKE 'shot-%' OR (v_item->>'id') LIKE 'pack-%';
      UPDATE public.products
         SET stock_qty = stock_qty + COALESCE((v_item->>'qty')::integer, 0)
       WHERE id = (v_item->>'id')::uuid;
    END LOOP;
  END IF;

  -- 3. Reduce balance_owed on the credit account
  UPDATE public.credit_accounts
     SET balance_owed = GREATEST(0, balance_owed - v_amount),
         updated_at   = now()
   WHERE id = v_credit_account_id
   RETURNING balance_owed INTO v_new_balance;

  -- 4. Close account if balance is now 0
  IF v_new_balance = 0 THEN
    UPDATE public.credit_accounts
       SET status = 'closed', updated_at = now()
     WHERE id = v_credit_account_id;
  END IF;

  -- 5. Delete wallet_transactions for owner and cashier for this charge
  DELETE FROM public.wallet_transactions
   WHERE type = 'credit_charge'
     AND (profile_id = v_owner_id OR profile_id = p_cashier_id)
     AND created_at = (
       SELECT created_at FROM public.credit_transactions WHERE id = p_credit_tx_id
     );

  -- 6. Delete the credit_transaction itself
  DELETE FROM public.credit_transactions WHERE id = p_credit_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_credit_charge(UUID, UUID) TO authenticated;
