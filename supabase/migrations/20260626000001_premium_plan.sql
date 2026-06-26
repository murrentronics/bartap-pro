-- ─────────────────────────────────────────────────────────────────────────────
-- Add Premium Plan ($1,300 TT/yr) and plan_type column on profiles
-- Basic plan = existing Annual Plan ($750) — no Machines access
-- Premium plan = $1,300/yr — includes Machines access
-- Special email renard.sankersingh@gmail.com = full access, never upgraded
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add plan_type to billing_plans table
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'basic'
  CHECK (plan_type IN ('basic', 'premium'));

-- 2. Mark the existing Annual Plan as basic
UPDATE public.billing_plans
SET plan_type = 'basic'
WHERE name = 'Annual Plan'
  AND name NOT ILIKE '[Archived]%';

-- 3. Insert the new Premium Plan
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
VALUES ('Premium Plan', 1300.00, 12, 'TT', 'premium')
ON CONFLICT DO NOTHING;

-- 4. Add plan_type to profiles so we know what tier the owner is on
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'basic'
  CHECK (plan_type IN ('basic', 'premium'));

-- 5. Add separate subscription tracking for premium so both countdowns are independent
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_subscription_start_date TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_subscription_end_date TIMESTAMPTZ;

-- 6. Grant the special account full access with premium plan_type
--    We match by email via auth.users join
UPDATE public.profiles
SET plan_type = 'premium'
WHERE id IN (
  SELECT au.id FROM auth.users au
  WHERE au.email = 'renard.sankersingh@gmail.com'
);

-- 7. Update check_overdue_payments to also expire premium subscriptions independently
CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Suspend approved owners whose basic subscription has expired
  -- and who have NOT submitted a pending basic payment
  UPDATE public.profiles
  SET status = 'suspended'
  WHERE role = 'owner'
    AND status = 'approved'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_payments bp
      JOIN public.billing_plans pl ON pl.id = bp.plan_id
      WHERE bp.owner_id = public.profiles.id
        AND bp.status = 'pending'
        AND pl.plan_type = 'basic'
    )
    -- Don't suspend the special access account
    AND id NOT IN (
      SELECT au.id FROM auth.users au
      WHERE au.email = 'renard.sankersingh@gmail.com'
    );

  -- Mark billing_status = 'expired' for all past-due active owners (basic)
  UPDATE public.profiles
  SET billing_status = 'expired'
  WHERE role = 'owner'
    AND billing_status = 'active'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW()
    AND id NOT IN (
      SELECT au.id FROM auth.users au
      WHERE au.email = 'renard.sankersingh@gmail.com'
    );

  -- Downgrade premium to basic when premium subscription expires
  UPDATE public.profiles
  SET plan_type = 'basic'
  WHERE role = 'owner'
    AND plan_type = 'premium'
    AND premium_subscription_end_date IS NOT NULL
    AND premium_subscription_end_date < NOW()
    AND id NOT IN (
      SELECT au.id FROM auth.users au
      WHERE au.email = 'renard.sankersingh@gmail.com'
    );
END;
$$;
