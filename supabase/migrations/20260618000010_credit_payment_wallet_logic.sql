-- ─────────────────────────────────────────────────────────────────────────────
-- Correct credit payment wallet logic:
--
-- CASE A — Cashier (not owner) takes payment:
--   • Cashier wallet_balance += amount  → cashier wallet record (amount = paid)
--   • Owner wallet record is READ-ONLY  → amount = 0, no balance change
--
-- CASE B — Owner takes payment themselves:
--   • Owner wallet_balance += amount    → owner wallet record (amount = paid)
--   • No second record inserted
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
  v_owner_id         UUID;
  v_account_name     TEXT;
  v_cashier_name     TEXT;
  v_old_balance      NUMERIC;
  v_new_balance      NUMERIC;
  v_settled          BOOLEAN;
  v_owner_is_cashier BOOLEAN;
BEGIN
  -- Read credit account
  SELECT owner_id, full_name, balance_owed
    INTO v_owner_id, v_account_name, v_old_balance
    FROM public.credit_accounts
   WHERE id = p_credit_account_id;

  SELECT username INTO v_cashier_name
    FROM public.profiles WHERE id = p_cashier_id;

  v_new_balance      := GREATEST(0, v_old_balance - p_amount);
  v_settled          := v_new_balance <= 0;
  v_owner_is_cashier := (p_cashier_id = v_owner_id);

  -- 1. Credit transaction record (audit trail)
  INSERT INTO public.credit_transactions
    (credit_account_id, owner_id, cashier_id, type, amount, note)
  VALUES (
    p_credit_account_id, v_owner_id, p_cashier_id, 'payment', p_amount,
    CASE WHEN v_settled
      THEN 'Bill settled — ' || COALESCE(v_account_name, 'Customer')
      ELSE 'Payment received: $' || p_amount::text
           || ' — Remaining: $' || v_new_balance::text
    END
  );

  -- 2. Update credit account balance / status
  UPDATE public.credit_accounts
  SET balance_owed = v_new_balance,
      status       = CASE WHEN v_settled THEN 'closed' ELSE 'open' END,
      updated_at   = now()
  WHERE id = p_credit_account_id;

  -- ── CASE A: a cashier (not the owner) took the cash ──────────────────────
  IF NOT v_owner_is_cashier THEN

    -- Cashier balance increases (they hold the cash)
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + p_amount
    WHERE id = p_cashier_id;

    -- Cashier wallet record — shows the money they collected
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
    VALUES (
      p_cashier_id,
      p_amount,
      'credit_payment',
      CASE WHEN v_settled
        THEN 'Credit — Bill settled: ' || COALESCE(v_account_name, 'Customer')
        ELSE 'Credit payment — ' || COALESCE(v_account_name, 'Customer')
             || ' | Paid: $' || p_amount::text
             || ' | Remaining: $' || v_new_balance::text
      END
    );

    -- Owner wallet record — READ-ONLY, amount = 0 (money is with cashier until cleared)
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
    VALUES (
      v_owner_id,
      0,
      'credit_payment',
      CASE WHEN v_settled
        THEN 'Credit — Bill settled: ' || COALESCE(v_account_name, 'Customer')
             || ' | Cashier: ' || COALESCE(v_cashier_name, 'Unknown')
        ELSE 'Credit payment: ' || COALESCE(v_account_name, 'Customer')
             || ' | Paid: $' || p_amount::text
             || ' | Remaining: $' || v_new_balance::text
             || ' | Cashier: ' || COALESCE(v_cashier_name, 'Unknown')
      END
    );

  -- ── CASE B: the owner took the cash themselves ────────────────────────────
  ELSE

    -- Owner balance increases directly
    UPDATE public.profiles
    SET wallet_balance = wallet_balance + p_amount
    WHERE id = v_owner_id;

    -- Owner wallet record — real credit, amount shown on right
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
    VALUES (
      v_owner_id,
      p_amount,
      'credit_payment',
      CASE WHEN v_settled
        THEN 'Credit — Bill settled: ' || COALESCE(v_account_name, 'Customer')
        ELSE 'Credit payment: ' || COALESCE(v_account_name, 'Customer')
             || ' | Paid: $' || p_amount::text
             || ' | Remaining: $' || v_new_balance::text
      END
    );

  END IF;
END;
$$;
