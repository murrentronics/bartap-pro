-- ─────────────────────────────────────────────────────────────────────────────
-- One-time cleanup: recalculate balance_owed for all credit accounts
-- from actual credit_transactions (charges minus payments).
-- Auto-closes any account whose real balance is 0 or less.
-- Fixes accounts stuck in 'open' with stale balance after record deletions.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.credit_accounts ca
SET
  balance_owed = GREATEST(0, COALESCE(tx.net, 0)),
  status = CASE
    WHEN GREATEST(0, COALESCE(tx.net, 0)) <= 0 THEN 'closed'
    ELSE status
  END,
  updated_at = now()
FROM (
  SELECT
    credit_account_id,
    SUM(CASE WHEN type = 'charge'  THEN amount ELSE 0 END)
    - SUM(CASE WHEN type = 'payment' THEN amount ELSE 0 END) AS net
  FROM public.credit_transactions
  GROUP BY credit_account_id
) tx
WHERE ca.id = tx.credit_account_id;

-- Also close any accounts that have NO transactions at all and balance = 0
UPDATE public.credit_accounts
SET status = 'closed', updated_at = now()
WHERE balance_owed = 0
  AND status = 'open'
  AND NOT EXISTS (
    SELECT 1 FROM public.credit_transactions
    WHERE credit_account_id = credit_accounts.id
  );
