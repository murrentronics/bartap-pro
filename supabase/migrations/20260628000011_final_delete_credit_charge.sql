-- Final fix: delete wallet_transactions by joining to credit_transactions
-- using the account's owner_id — no timestamp guessing, no extra columns needed.
-- The key insight: when delete_credit_charge runs, the credit_transaction row
-- still exists (we delete it LAST), so we can join on owner_id + type + time.

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
  SELECT credit_account_id, owner_id, amount, items, created_at
    INTO v_credit_account_id, v_owner_id, v_amount, v_items, v_charge_time
    FROM public.credit_transactions
   WHERE id = p_credit_tx_id AND type = 'charge';

  IF NOT FOUND THEN RAISE EXCEPTION 'Credit charge not found'; END IF;

  -- Reverse shots/packs
  IF v_items IS NOT NULL THEN PERFORM public.reverse_order_shot_pack(v_items); END IF;

  -- Restore stock
  IF v_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      CONTINUE WHEN (v_item->>'id') LIKE 'shot-%' OR (v_item->>'id') LIKE 'pack-%';
      UPDATE public.products
         SET stock_qty = stock_qty + COALESCE((v_item->>'qty')::integer, 0)
       WHERE id = (v_item->>'id')::uuid;
    END LOOP;
  END IF;

  -- Reduce balance
  UPDATE public.credit_accounts
     SET balance_owed = GREATEST(0, balance_owed - v_amount), updated_at = now()
   WHERE id = v_credit_account_id
   RETURNING balance_owed INTO v_new_balance;

  IF v_new_balance = 0 THEN
    UPDATE public.credit_accounts SET status = 'closed', updated_at = now()
     WHERE id = v_credit_account_id;
  END IF;

  -- Delete wallet_transactions: owner row + cashier row
  -- Use credit_tx_id if column exists (migration 007), else fall back to time window
  BEGIN
    -- Try exact match first (works if migration 007 was run)
    DELETE FROM public.wallet_transactions
     WHERE credit_tx_id = p_credit_tx_id;
  EXCEPTION WHEN undefined_column THEN
    -- credit_tx_id column doesn't exist yet — use time window fallback
    NULL;
  END;

  -- Always also delete by time window to catch rows without credit_tx_id
  DELETE FROM public.wallet_transactions
   WHERE type = 'credit_charge'
     AND profile_id IN (v_owner_id, p_cashier_id)
     AND created_at BETWEEN v_charge_time - INTERVAL '60 seconds'
                        AND v_charge_time + INTERVAL '60 seconds';

  -- Delete the credit_transaction itself (must be last)
  DELETE FROM public.credit_transactions WHERE id = p_credit_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_credit_charge(UUID, UUID) TO authenticated;
