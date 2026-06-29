-- ─────────────────────────────────────────────────────────────────────────────
-- Add credit_tx_id to wallet_transactions so credit charge rows can be
-- deleted by exact reference — same pattern as order_id for cash orders.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS credit_tx_id UUID REFERENCES public.credit_transactions(id) ON DELETE CASCADE;

-- ── Update record_credit_charge to store the credit_tx_id on wallet rows ──────
CREATE OR REPLACE FUNCTION public.record_credit_charge(
  p_credit_account_id UUID,
  p_cashier_id        UUID,
  p_amount            NUMERIC,
  p_items             JSONB,
  p_note              TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_owner_id         UUID;
  v_account_name     TEXT;
  v_cashier_name     TEXT;
  v_old_balance      NUMERIC;
  v_new_balance      NUMERIC;
  v_owner_is_cashier BOOLEAN;
  v_item             JSONB;
  v_credit_tx_id     UUID;
BEGIN
  SELECT owner_id, full_name, balance_owed
    INTO v_owner_id, v_account_name, v_old_balance
    FROM public.credit_accounts WHERE id = p_credit_account_id;

  SELECT username INTO v_cashier_name FROM public.profiles WHERE id = p_cashier_id;

  v_new_balance      := v_old_balance + p_amount;
  v_owner_is_cashier := (p_cashier_id = v_owner_id);

  -- 1. Insert credit transaction and capture its id
  INSERT INTO public.credit_transactions
    (credit_account_id, owner_id, cashier_id, type, amount, items, note)
  VALUES (
    p_credit_account_id, v_owner_id, p_cashier_id, 'charge', p_amount, p_items,
    COALESCE(p_note, 'Credit sale')
  )
  RETURNING id INTO v_credit_tx_id;

  -- 2. Update balance_owed and open the account
  UPDATE public.credit_accounts
     SET balance_owed = v_new_balance, status = 'open', updated_at = now()
   WHERE id = p_credit_account_id;

  -- 3. Restore stock (skip synthetic ids)
  IF p_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      CONTINUE WHEN (v_item->>'id') LIKE 'shot-%' OR (v_item->>'id') LIKE 'pack-%';
      UPDATE public.products
         SET stock_qty = GREATEST(0, stock_qty - COALESCE((v_item->>'qty')::integer, 0))
       WHERE id = (v_item->>'id')::uuid;
    END LOOP;
  END IF;

  -- 4. Owner wallet record — store credit_tx_id for reliable delete later
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, credit_tx_id)
  VALUES (
    v_owner_id, 0, 'credit_charge',
    'Credit: ' || COALESCE(v_account_name, 'Customer')
      || ' | $' || p_amount::text
      || ' | Balance owed: $' || v_new_balance::text
      || CASE WHEN v_owner_is_cashier THEN ''
              ELSE ' | Cashier: ' || COALESCE(v_cashier_name, 'Unknown') END
      || CASE WHEN p_note IS NOT NULL AND p_note <> ''
              THEN ' | Items: ' || p_note ELSE '' END,
    v_credit_tx_id
  );

  -- 5. Cashier wallet record (only when cashier ≠ owner)
  IF NOT v_owner_is_cashier THEN
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, credit_tx_id)
    VALUES (
      p_cashier_id, 0, 'credit_charge',
      'Credit: ' || COALESCE(v_account_name, 'Customer')
        || ' | $' || p_amount::text
        || ' | Balance owed: $' || v_new_balance::text
        || CASE WHEN p_note IS NOT NULL AND p_note <> ''
                THEN ' | Items: ' || p_note ELSE '' END,
      v_credit_tx_id
    );
  END IF;
END;
$$;

-- ── Update delete_credit_charge to delete by credit_tx_id (exact match) ───────
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
  SELECT credit_account_id, owner_id, amount, items
    INTO v_credit_account_id, v_owner_id, v_amount, v_items
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

  -- Delete ALL wallet_transactions for this credit charge by exact credit_tx_id
  -- This catches both the owner row and the cashier row reliably.
  DELETE FROM public.wallet_transactions WHERE credit_tx_id = p_credit_tx_id;

  -- Also fallback: delete by timestamp window for any old rows without credit_tx_id
  DELETE FROM public.wallet_transactions
   WHERE type = 'credit_charge'
     AND (profile_id = v_owner_id OR profile_id = p_cashier_id)
     AND credit_tx_id IS NULL
     AND created_at BETWEEN (
       SELECT created_at FROM public.credit_transactions WHERE id = p_credit_tx_id
     ) - INTERVAL '10 seconds'
     AND (
       SELECT created_at FROM public.credit_transactions WHERE id = p_credit_tx_id
     ) + INTERVAL '10 seconds';

  -- Delete the credit transaction itself
  DELETE FROM public.credit_transactions WHERE id = p_credit_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_credit_charge(UUID, UUID) TO authenticated;
