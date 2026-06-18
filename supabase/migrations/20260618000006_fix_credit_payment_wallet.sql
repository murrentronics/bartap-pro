-- ─────────────────────────────────────────────────────────────────────────────
-- Fix record_credit_payment:
-- 1. Correct balance calculation (read old balance first, then update)
-- 2. Cashier wallet note shows remaining balance and "Bill settled" on final pay
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_credit_payment(
  p_credit_account_id UUID,
  p_cashier_id        UUID,
  p_amount            NUMERIC
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
  v_settled        BOOLEAN;
  v_cashier_note   TEXT;
  v_payment_note   TEXT;
BEGIN
  -- Fetch account info + current balance
  SELECT owner_id, full_name, balance_owed
    INTO v_owner_id, v_account_name, v_old_balance
    FROM public.credit_accounts
   WHERE id = p_credit_account_id;

  SELECT username INTO v_cashier_name
    FROM public.profiles WHERE id = p_cashier_id;

  v_new_balance := GREATEST(0, v_old_balance - p_amount);
  v_settled     := v_new_balance <= 0;

  -- Build notes
  v_payment_note := CASE
    WHEN v_settled
      THEN 'Bill settled — ' || COALESCE(v_account_name, 'Customer')
    ELSE
      'Payment received — Balance remaining: $' || v_new_balance::text
  END;

  v_cashier_note := CASE
    WHEN v_settled
      THEN 'Credit — Bill settled: ' || COALESCE(v_account_name, 'Customer')
    ELSE
      'Credit payment — ' || COALESCE(v_account_name, 'Customer')
        || ' | Balance remaining: $' || v_new_balance::text
  END;

  -- 1. Insert credit transaction (payment)
  INSERT INTO public.credit_transactions
    (credit_account_id, owner_id, cashier_id, type, amount, note)
  VALUES
    (p_credit_account_id, v_owner_id, p_cashier_id, 'payment', p_amount, v_payment_note);

  -- 2. Update balance, auto-close if fully settled
  UPDATE public.credit_accounts
  SET balance_owed = v_new_balance,
      status       = CASE WHEN v_settled THEN 'closed' ELSE 'open' END,
      updated_at   = now()
  WHERE id = p_credit_account_id;

  -- 3. Owner wallet — read-only informational record (amount = 0, no balance change)
  -- Money comes to owner when cashier clears wallet balance.
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
  VALUES (
    v_owner_id,
    0,
    'credit_payment',
    CASE WHEN v_settled
      THEN 'Credit — Bill settled: ' || COALESCE(v_account_name, 'Customer')
           || ' | Cashier: ' || COALESCE(v_cashier_name, '')
      ELSE 'Credit payment: ' || COALESCE(v_account_name, 'Customer')
           || ' | Balance remaining: $' || v_new_balance::text
           || ' | Cashier: ' || COALESCE(v_cashier_name, '')
    END
  );

  -- 4. Cashier wallet — debit record (they collected the cash)
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_cashier_id;

  INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
  VALUES (
    p_cashier_id,
    p_amount,
    'credit_payment',
    v_cashier_note
  );
END;
$$;
