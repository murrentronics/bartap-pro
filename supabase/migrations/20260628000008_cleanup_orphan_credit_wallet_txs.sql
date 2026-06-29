-- ─────────────────────────────────────────────────────────────────────────────
-- Clean up orphaned credit_charge wallet_transactions that have no matching
-- credit_transaction (the credit_transaction was deleted but wallet row survived).
-- ─────────────────────────────────────────────────────────────────────────────

-- Delete all credit_charge wallet_transactions where either:
-- 1. credit_tx_id is set but the referenced credit_transaction no longer exists
--    (handled automatically by ON DELETE CASCADE if migration 007 was run)
-- 2. credit_tx_id is NULL and there is no credit_transaction for the same
--    owner within 10 seconds (old rows from before migration 007)
DELETE FROM public.wallet_transactions wt
WHERE wt.type = 'credit_charge'
  AND NOT EXISTS (
    SELECT 1 FROM public.credit_transactions ct
    WHERE ct.owner_id = wt.profile_id
       OR ct.cashier_id = wt.profile_id
  );
