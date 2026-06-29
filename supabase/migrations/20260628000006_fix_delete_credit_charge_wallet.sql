-- ─────────────────────────────────────────────────────────────────────────────
-- Fix delete_credit_charge: wallet_transactions were not being removed because
-- the created_at timestamp match was too strict (millisecond mismatch between
-- credit_transactions and wallet_transactions rows).
--
-- Fix: match wallet_transactions by a 10-second window around the charge
-- created_at, scoped to the owner and cashier profiles.
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
  v_charge_time       TIMESTAMPTZ;
BEGIN
  -- Fetch the charge record
  SELECT credit_account_id, owner_id, amount, items, created_at
    INTO v_credit_account_id, v_owner_id, v_amount, v_items, v_charge_time
    FROM public.credit_transactions
   WHERE id = p_credit_tx_id AND type = 'charge';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit charge not found';
  END IF;

  -- 1. Reverse shots_sold / units_sold / revenue on any opened bottles or packs
  IF v_items IS NOT NULL THEN
    PERFORM public.reverse_order_shot_pack(v_items);
  END IF;

  -- 2. Restore stock for each item (skip synthetic shot-/pack- ids)
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

  -- 5. Delete wallet_transactions for owner AND cashier within a 10-second
  --    window of the charge — avoids millisecond mismatch on exact timestamp match
  DELETE FROM public.wallet_transactions
   WHERE type = 'credit_charge'
     AND (profile_id = v_owner_id OR profile_id = p_cashier_id)
     AND created_at BETWEEN v_charge_time - INTERVAL '10 seconds'
                        AND v_charge_time + INTERVAL '10 seconds';

  -- 6. Delete the credit_transaction itself
  DELETE FROM public.credit_transactions WHERE id = p_credit_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_credit_charge(UUID, UUID) TO authenticated;
