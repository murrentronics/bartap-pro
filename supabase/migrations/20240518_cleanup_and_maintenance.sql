-- ============================================================
-- MIGRATION: Database Cleanup & Maintenance
-- ============================================================
-- 1. Delete wallet_transactions older than 7 years
-- 2. Delete orders older than 7 years
-- 3. Create a scheduled cleanup function for future use
-- ============================================================

-- Delete wallet transactions older than 7 years
DELETE FROM public.wallet_transactions
WHERE created_at < NOW() - INTERVAL '7 years';

-- Delete orders older than 7 years
DELETE FROM public.orders
WHERE created_at < NOW() - INTERVAL '7 years';

-- Delete billing payments older than 7 years (keep paid ones for accounting)
-- Only delete rejected/cancelled ones older than 7 years
DELETE FROM public.billing_payments
WHERE created_at < NOW() - INTERVAL '7 years'
  AND status = 'rejected';

-- ============================================================
-- Create a reusable cleanup function for scheduled maintenance
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_records()
RETURNS TABLE(
  deleted_transactions bigint,
  deleted_orders bigint,
  deleted_payments bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _tx_count bigint;
  _order_count bigint;
  _payment_count bigint;
BEGIN
  -- Only admins can run this
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  -- Delete wallet transactions older than 7 years
  DELETE FROM public.wallet_transactions
  WHERE created_at < NOW() - INTERVAL '7 years';
  GET DIAGNOSTICS _tx_count = ROW_COUNT;

  -- Delete orders older than 7 years
  DELETE FROM public.orders
  WHERE created_at < NOW() - INTERVAL '7 years';
  GET DIAGNOSTICS _order_count = ROW_COUNT;

  -- Delete rejected billing payments older than 7 years
  DELETE FROM public.billing_payments
  WHERE created_at < NOW() - INTERVAL '7 years'
    AND status = 'rejected';
  GET DIAGNOSTICS _payment_count = ROW_COUNT;

  RETURN QUERY SELECT _tx_count, _order_count, _payment_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_old_records() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_old_records() TO authenticated;

COMMENT ON FUNCTION public.cleanup_old_records() IS
'Admin-only function to delete records older than 7 years. Returns counts of deleted rows.';

-- ============================================================
-- Add indexes to improve pagination query performance
-- ============================================================

-- Index for billing_payments pagination (owner + date)
CREATE INDEX IF NOT EXISTS idx_billing_payments_owner_date
  ON public.billing_payments(owner_id, created_at DESC);

-- Index for billing_payments status filter + date
CREATE INDEX IF NOT EXISTS idx_billing_payments_status_date
  ON public.billing_payments(status, created_at DESC);

-- Index for wallet_transactions cleanup
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at
  ON public.wallet_transactions(created_at);

-- Index for orders cleanup
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders(created_at);
