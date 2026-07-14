-- ============================================================
-- Machines Only Plan — new standalone plan type
--   machines_only  $800/yr  — machines tracker only
--   bar_addon      $600/yr  — add bar POS to a machines_only account
--
-- Also adds is_machines_account flag to profiles for chain sub-accounts
-- ============================================================

-- 1. Add is_machines_account flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_machines_account boolean NOT NULL DEFAULT false;

-- 2. Add bar_addon_active flag — true when a machines_only user has added the bar add-on
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bar_addon_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_machines_account
  IS 'True when this profile is a machines-only sub-account under a chain owner';
COMMENT ON COLUMN public.profiles.bar_addon_active
  IS 'True when a machines_only owner has activated the bar add-on';

-- 2. Drop existing plan_type check constraint on billing_plans
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_plan_type_check;
DO $$
DECLARE r RECORD;
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

-- 3. Re-add constraint including new plan types
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_type_check
  CHECK (plan_type IN ('basic', 'machines_addon', 'premium', 'chain', 'machines_only', 'bar_addon'));

-- 4. Insert Machines Only plan ($800/yr) — idempotent
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Machines Only Plan', 800.00, 12, 'TT', 'machines_only'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_plans WHERE plan_type = 'machines_only'
);

-- 5. Insert Bar Add-on plan ($600/yr) — idempotent
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Bar Add-on', 600.00, 12, 'TT', 'bar_addon'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_plans WHERE plan_type = 'bar_addon'
);
