-- ─────────────────────────────────────────────────────────────────────────────
-- Billing plan structure:
--   Basic Plan         $750/yr   — register, credit, wallet, cashiers, music
--   Machines Add-on    $550/yr   — adds Machines Tracker (Basic subscribers only)
--   Premium Plan      $1300/yr   — everything in one subscription
--
-- Special account: renard.sankersingh@gmail.com — full access, no upgrade prompts
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add plan_type column if it doesn't exist yet (no constraint yet)
ALTER TABLE public.billing_plans
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'basic';

-- 2. Drop ALL existing check constraints on plan_type (brute-force by name patterns)
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_plan_type_check;
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_plan_type_check1;
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_plan_type_check2;

-- Also drop via catalog in case the name differs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.billing_plans'::regclass
      AND contype = 'c'
      AND conname LIKE '%plan_type%'
  LOOP
    EXECUTE 'ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- 3. Now add the correct constraint with all three values
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_type_check
  CHECK (plan_type IN ('basic', 'machines_addon', 'premium'));

-- 4. Mark existing Annual Plan as basic
UPDATE public.billing_plans
SET plan_type = 'basic'
WHERE name = 'Annual Plan'
  AND name NOT ILIKE '[Archived]%';

-- 5. Insert Machines Add-on plan ($550/yr) — idempotent
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Machines Add-on', 550.00, 12, 'TT', 'machines_addon'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_plans WHERE name = 'Machines Add-on'
);

-- 6. Insert Premium Plan ($1,300/yr) — idempotent
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Premium Plan', 1300.00, 12, 'TT', 'premium'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_plans WHERE name = 'Premium Plan'
);

-- 7. Add plan_type to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'basic';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_type_check
  CHECK (plan_type IN ('basic', 'premium'));

-- 8. Add machines add-on tracking columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS machines_addon_active     BOOLEAN     DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS machines_addon_start_date TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS machines_addon_end_date   TIMESTAMPTZ;

-- 9. Add premium subscription date columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_subscription_start_date TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_subscription_end_date   TIMESTAMPTZ;

-- 10. Grant special account full premium access permanently
UPDATE public.profiles
SET plan_type = 'premium'
WHERE id IN (
  SELECT au.id FROM auth.users au
  WHERE au.email = 'renard.sankersingh@gmail.com'
);

-- 11. Replace check_overdue_payments function
CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  special_id UUID;
BEGIN
  SELECT au.id INTO special_id FROM auth.users au
  WHERE au.email = 'renard.sankersingh@gmail.com' LIMIT 1;

  -- Suspend owners whose basic subscription expired with no pending payment
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

  -- Mark billing_status = expired
  UPDATE public.profiles
  SET billing_status = 'expired'
  WHERE role = 'owner'
    AND billing_status = 'active'
    AND subscription_end_date IS NOT NULL
    AND subscription_end_date < NOW()
    AND (special_id IS NULL OR id != special_id);

  -- Revoke machines add-on when it expires
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
