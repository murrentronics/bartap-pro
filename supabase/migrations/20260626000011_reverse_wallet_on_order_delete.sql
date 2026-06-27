-- ─────────────────────────────────────────────────────────────────────────────
-- When an order is deleted, reverse the cashier's wallet_balance increment
-- that was applied by the on_order_insert trigger.
--
-- Also fixes two related issues in record_credit_charge:
--   • The stock-decrement loop now skips synthetic shot-/pack- ids so a UUID
--     cast error can't abort the entire credit charge transaction.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Trigger: decrement cashier wallet_balance on order DELETE ──────────────
CREATE OR REPLACE FUNCTION public.handle_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reverse the wallet credit applied at insert time
  UPDATE public.profiles
     SET wallet_balance = GREATEST(0, wallet_balance - OLD.total)
   WHERE id = OLD.cashier_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_order_delete ON public.orders;
CREATE TRIGGER on_order_delete
  AFTER DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_delete();

-- ── 2. Fix record_credit_charge — guard synthetic ids in stock loop ───────────
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
BEGIN
  SELECT owner_id, full_name, balance_owed
    INTO v_owner_id, v_account_name, v_old_balance
    FROM public.credit_accounts WHERE id = p_credit_account_id;

  SELECT username INTO v_cashier_name
    FROM public.profiles WHERE id = p_cashier_id;

  v_new_balance      := v_old_balance + p_amount;
  v_owner_is_cashier := (p_cashier_id = v_owner_id);

  -- 1. Insert credit transaction (charge) with items
  INSERT INTO public.credit_transactions
    (credit_account_id, owner_id, cashier_id, type, amount, items, note)
  VALUES (
    p_credit_account_id, v_owner_id, p_cashier_id, 'charge', p_amount, p_items,
    COALESCE(p_note, 'Credit sale')
  );

  -- 2. Update balance_owed and open the account
  UPDATE public.credit_accounts
  SET balance_owed = v_new_balance,
      status       = 'open',
      updated_at   = now()
  WHERE id = p_credit_account_id;

  -- 3. Decrement stock for each item.
  --    Skip synthetic shot-/pack- ids — those are virtual items that don't have
  --    a products row. Attempting to cast them as UUID would abort the transaction.
  IF p_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      CONTINUE WHEN (v_item->>'id') LIKE 'shot-%' OR (v_item->>'id') LIKE 'pack-%';
      UPDATE public.products
         SET stock_qty = GREATEST(0, stock_qty - COALESCE((v_item->>'qty')::integer, 0))
       WHERE id = (v_item->>'id')::uuid;
    END LOOP;
  END IF;

  -- 4. Owner wallet record — read-only, amount=0, full detail in note
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
  VALUES (
    v_owner_id,
    0,
    'credit_charge',
    'Credit: ' || COALESCE(v_account_name, 'Customer')
      || ' | $' || p_amount::text
      || ' | Balance owed: $' || v_new_balance::text
      || CASE WHEN v_owner_is_cashier THEN ''
              ELSE ' | Cashier: ' || COALESCE(v_cashier_name, 'Unknown')
         END
      || CASE WHEN p_note IS NOT NULL AND p_note <> ''
              THEN ' | Items: ' || p_note
              ELSE ''
         END
  );

  -- 5. Cashier wallet record — only when cashier ≠ owner
  IF NOT v_owner_is_cashier THEN
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
    VALUES (
      p_cashier_id,
      0,
      'credit_charge',
      'Credit: ' || COALESCE(v_account_name, 'Customer')
        || ' | $' || p_amount::text
        || ' | Balance owed: $' || v_new_balance::text
        || CASE WHEN p_note IS NOT NULL AND p_note <> ''
                THEN ' | Items: ' || p_note
                ELSE ''
           END
    );
  END IF;
END;
$$;
