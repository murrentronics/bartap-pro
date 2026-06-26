-- ─────────────────────────────────────────────────────────────────────────────
-- Billing plan structure:
--   Basic Plan         $750/yr   — register, credit, wallet, cashiers, music
--   Machines Add-on    $550/yr   — adds Machines Tracker (Basic subscribers only)
--   Premium Plan      $1300/yr   — everything in one subscription
--
-- Special account: renard.sankersingh@gmail.com — full access, no upgrade prompts
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add plan_type column to billing_plans
--    Drop old constraint first if it exists (may only have 'basic','premium')
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'basic';

-- Drop the old check constraint if it exists (name varies by Supabase version)
DO $$
BEGIN
  ALTER TABLE public.billing_plans
    DROP CONSTRAINT IF EXISTS billing_plans_plan_type_check;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add the correct constraint with all three values
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_type_check
  CHECK (plan_type IN ('basic', 'machines_addon', 'premium'));

-- 2. Mark existing Annual Plan as basic
UPDATE public.billing_plans
SET plan_type = 'basic'
WHERE name = 'Annual Plan'
  AND name NOT ILIKE '[Archived]%';

-- 3. Insert Machines Add-on plan ($550/yr)
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
VALUES ('Machines Add-on', 550.00, 12, 'TT', 'machines_addon')
ON CONFLICT DO NOTHING;

-- 4. Insert Premium Plan ($1,300/yr — everything in one)
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
VALUES ('Premium Plan', 1300.00, 12, 'TT', 'premium')
ON CONFLICT DO NOTHING;

-- 5. Add plan_type to profiles (basic | premium)
--    machines_addon owners stay 'basic' but have machines_addon_active = true
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'basic'
  CHECK (plan_type IN ('basic', 'premium'));

-- 6. Track Machines Add-on subscription independently on the profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS machines_addon_active     BOOLEAN     DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS machines_addon_start_date TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS machines_addon_end_date   TIMESTAMPTZ;

-- 7. Track Premium subscription end date independently
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_subscription_start_date TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_subscription_end_date   TIMESTAMPTZ;

-- 8. Grant special account full premium access permanently
UPDATE public.profiles
SET plan_type = 'premium'
WHERE id IN (
  SELECT au.id FROM auth.users au
  WHERE au.email = 'renard.sankersingh@gmail.com'
);

-- 9. Replace check_overdue_payments to handle all three plan types
CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  special_id UUID;
BEGIN
  -- Get special account id (may not exist yet)
  SELECT au.id INTO special_id FROM auth.users au
  WHERE au.email = 'renard.sankersingh@gmail.com' LIMIT 1;

  -- Suspend owners whose basic subscription expired with no pending basic payment
  UPDATE public.profiles
  SET status = 'suspended'
  WHERE role = 'owner'
    AND status = 'approved'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW()
    AND (special_id IS NULL OR id != special_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_payments bp
      JOIN public.billing_plans pl ON pl.id = bp.plan_id
      WHERE bp.owner_id = public.profiles.id
        AND bp.status = 'pending'
        AND pl.plan_type IN ('basic', 'premium')
    );

  -- Mark billing_status = expired for past-due active owners
  UPDATE public.profiles
  SET billing_status = 'expired'
  WHERE role = 'owner'
    AND billing_status = 'active'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW()
    AND (special_id IS NULL OR id != special_id);

  -- Revoke machines add-on when its subscription expires
  UPDATE public.profiles
  SET machines_addon_active = false
  WHERE role = 'owner'
    AND machines_addon_active = true
    AND machines_addon_end_date IS NOT NULL
    AND machines_addon_end_date < NOW()
    AND plan_type = 'basic'
    AND (special_id IS NULL OR id != special_id);

  -- Downgrade premium to basic when premium subscription expires
  UPDATE public.profiles
  SET plan_type = 'basic'
  WHERE role = 'owner'
    AND plan_type = 'premium'
    AND premium_subscription_end_date IS NOT NULL
    AND premium_subscription_end_date < NOW()
    AND (special_id IS NULL OR id != special_id);
END;
$$;
