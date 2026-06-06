-- ─── Reset all billing payments and owner subscription status ────────────────
-- Wipes all payment history and resets every owner back to pending so they
-- must resubmit under the new plan pricing.

-- 1. Delete all payment records
DELETE FROM public.billing_payments;

-- 2. Reset all owner profiles to pending / no active subscription
UPDATE public.profiles
SET
  status                  = 'pending',
  billing_status          = 'pending_setup',
  current_plan_id         = NULL,
  subscription_start_date = NULL,
  subscription_end_date   = NULL
WHERE role = 'owner';
