-- ─────────────────────────────────────────────────────────────────────────────
-- Definitive fix for delete_credit_charge.
-- Reads owner_id and cashier_id FIRST, deletes wallet_transactions by
-- profile + type + time window BEFORE deleting the credit_transaction row.
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
  -- 1. Read the charge — capture owner, amount, items AND timestamp
  SELECT credit_account_id, owner_id, amount, items, created_at
    INTO v_credit_account_id, v_owner_id, v_amount, v_items, v_charge_time
    FROM public.credit_transactions
   WHERE id = p_credit_tx_id AND type = 'charge';

  IF NOT FOUND THEN RAISE EXCEPTION 'Credit charge not found'; END IF;

  -- 2. Reverse shots/packs
  IF v_items IS NOT NULL THEN
    PERFORM public.reverse_order_shot_pack(v_items);
  END IF;

  -- 3. Restore stock
  IF v_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      CONTINUE WHEN (v_item->>'id') LIKE 'shot-%' OR (v_item->>'id') LIKE 'pack-%';
      UPDATE public.products
         SET stock_qty = stock_qty + COALESCE((v_item->>'qty')::integer, 0)
       WHERE id = (v_item->>'id')::uuid;
    END LOOP;
  END IF;

  -- 4. Reduce balance
  UPDATE public.credit_accounts
     SET balance_owed = GREATEST(0, balance_owed - v_amount),
         updated_at   = now()
   WHERE id = v_credit_account_id
   RETURNING balance_owed INTO v_new_balance;

  IF v_new_balance = 0 THEN
    UPDATE public.credit_accounts
       SET status = 'closed', updated_at = now()
     WHERE id = v_credit_account_id;
  END IF;

  -- 5. Delete wallet_transactions for BOTH owner and cashier.
  --    Use a wide 60-second window — these rows are always created within
  --    milliseconds of the credit_transaction row in the same DB call.
  --    We delete BEFORE the credit_transaction so v_charge_time is still valid.
  DELETE FROM public.wallet_transactions
   WHERE type = 'credit_charge'
     AND profile_id IN (v_owner_id, p_cashier_id)
     AND created_at >= v_charge_time - INTERVAL '60 seconds'
     AND created_at <= v_charge_time + INTERVAL '60 seconds';

  -- 6. Delete the credit_transaction itself
  DELETE FROM public.credit_transactions WHERE id = p_credit_tx_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_credit_charge(UUID, UUID) TO authenticated;
