-- ─────────────────────────────────────────────────────────────────────────────
-- Fix subscription expiry & auto-suspension
--
-- Problems fixed:
-- 1. check_overdue_payments() set status = 'pending' instead of 'suspended'
-- 2. Schedule the cron job to actually run automatically at midnight UTC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN

  -- Suspend approved owners whose subscription has expired
  -- and who have NOT submitted a pending payment.
  UPDATE public.profiles
  SET status = 'suspended'
  WHERE role = 'owner'
    AND status = 'approved'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_payments
      WHERE owner_id = public.profiles.id
        AND status = 'pending'
    );

  -- Mark billing_status = 'expired' for all past-due active owners
  UPDATE public.profiles
  SET billing_status = 'expired'
  WHERE role = 'owner'
    AND billing_status = 'active'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW();

END;
$$;

-- ── Schedule cron: run daily at midnight UTC ──────────────────────────────────
-- Unschedule first to avoid duplicate if migration is re-run
SELECT cron.unschedule('check-overdue-payments');
SELECT cron.schedule('check-overdue-payments', '0 0 * * *', 'SELECT public.check_overdue_payments()');
