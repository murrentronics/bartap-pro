-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill missing cashier wallet_transactions for existing credit_charge
-- records where cashier ≠ owner and no cashier record exists yet.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      ct.cashier_id,
      ct.amount,
      ct.note,
      ct.created_at,
      ca.full_name AS account_name
    FROM public.credit_transactions ct
    JOIN public.credit_accounts ca ON ca.id = ct.credit_account_id
    WHERE ct.type = 'charge'
      AND ct.cashier_id IS NOT NULL
      AND ct.cashier_id <> ca.owner_id
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions wt
        WHERE wt.profile_id = ct.cashier_id
          AND wt.type = 'credit_charge'
          -- match within 1 second of the credit transaction
          AND ABS(EXTRACT(EPOCH FROM (wt.created_at - ct.created_at))) < 1
      )
  LOOP
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, created_at)
    VALUES (
      r.cashier_id,
      0,
      'credit_charge',
      'Credit: ' || COALESCE(r.account_name, 'Customer')
        || ' | $' || r.amount::text
        || CASE WHEN r.note IS NOT NULL AND r.note <> 'Credit sale'
                THEN ' | Items: ' || r.note
                ELSE ''
           END,
      r.created_at
    );
  END LOOP;
END;
$$;
