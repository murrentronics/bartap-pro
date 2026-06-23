-- ─────────────────────────────────────────────────────────────────────────────
-- delete_credit_charge(p_credit_tx_id)
--
-- Atomically:
--   1. Reads the charge amount + account from credit_transactions
--   2. Deletes matching wallet_transactions of type 'credit_charge' that were
--      created within 10 seconds of the credit transaction (best-effort match)
--   3. Deletes the credit_transactions row itself
--   4. Recalculates balance_owed on credit_accounts from remaining charges/payments
--   5. Sets status back to 'open'/'closed' based on new balance
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_credit_charge(
  p_credit_tx_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_account_id  UUID;
  v_owner_id    UUID;
  v_amount      NUMERIC;
  v_created_at  TIMESTAMPTZ;
  v_new_balance NUMERIC;
BEGIN
  -- 1. Read the charge being deleted
  SELECT credit_account_id, owner_id, amount, created_at
    INTO v_account_id, v_owner_id, v_amount, v_created_at
    FROM public.credit_transactions
   WHERE id = p_credit_tx_id AND type = 'charge';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit charge not found';
  END IF;

  -- 2. Delete wallet_transactions of type 'credit_charge' for this owner/account
  --    created within 10 seconds of the charge (catches both owner + cashier records)
  DELETE FROM public.wallet_transactions
   WHERE type = 'credit_charge'
     AND profile_id IN (
           SELECT id FROM public.profiles
            WHERE id = v_owner_id
               OR parent_id = v_owner_id
         )
     AND created_at BETWEEN v_created_at - interval '10 seconds'
                        AND v_created_at + interval '10 seconds';

  -- 3. Delete the credit transaction itself
  DELETE FROM public.credit_transactions WHERE id = p_credit_tx_id;

  -- 4. Recalculate balance from remaining rows
  SELECT COALESCE(
    SUM(CASE WHEN type = 'charge'  THEN amount
             WHEN type = 'payment' THEN -amount
             ELSE 0
        END), 0
  )
  INTO v_new_balance
  FROM public.credit_transactions
  WHERE credit_account_id = v_account_id;

  v_new_balance := GREATEST(0, v_new_balance);

  -- 5. Update account
  UPDATE public.credit_accounts
     SET balance_owed = v_new_balance,
         status       = CASE WHEN v_new_balance <= 0 THEN 'closed' ELSE 'open' END,
         updated_at   = now()
   WHERE id = v_account_id;
END;
$$;

-- Allow authenticated users to call it (RLS on tables handles row-level security)
GRANT EXECUTE ON FUNCTION public.delete_credit_charge(UUID) TO authenticated;
