-- ─────────────────────────────────────────────────────────────────────────────
-- Include the items list, charge amount, and new balance owed in the owner
-- wallet note for credit_charge records so the transaction card shows the
-- full shopping list + running balance like cash sales do.
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_owner_id       UUID;
  v_account_name   TEXT;
  v_cashier_name   TEXT;
  v_old_balance    NUMERIC;
  v_new_balance    NUMERIC;
  v_owner_is_cashier BOOLEAN;
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

  -- 3. Owner wallet record — read-only, amount=0, full detail in note
  --    Format: "Credit: <name> | $<amount> | Balance owed: $<new> | Cashier: <cashier> | Items: <items>"
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

  -- 4. Cashier wallet record — only when cashier ≠ owner
  --    Shows what they charged so the cashier has a record too
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
