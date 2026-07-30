-- ============================================================
-- Multi-bar addon system for Bar Only, Machines Only, and Premium plans
--
-- New plan types:
--   bar_only_addon     $1,200/yr per extra bar (Bar Only owners adding more bars)
--   machines_bar_addon $1,200/yr per extra bar (Machines Only owners adding more bars)
--   premium_addon      $1,500/yr per extra bar (Premium owners adding more bars)
--
-- New profile columns:
--   addon_bar_count    integer  — total extra bars paid for (not counting bar 1)
--   is_multi_bar       boolean  — true when this owner has 2+ bars via addon system
--
-- New billing_payments column:
--   addon_bar_count    integer  — how many extra bars this payment covers
--   addon_bar_data     jsonb    — [{name, location, type}] set at checkout time
-- ============================================================

-- 1. Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS addon_bar_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_multi_bar boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.addon_bar_count
  IS 'Number of extra bar sub-accounts this owner has paid for via addon billing';
COMMENT ON COLUMN public.profiles.is_multi_bar
  IS 'True when this non-chain owner has paid for additional bars via addon billing';

-- 2. Add columns to billing_payments
ALTER TABLE public.billing_payments
  ADD COLUMN IF NOT EXISTS addon_bar_count integer NOT NULL DEFAULT 1;
ALTER TABLE public.billing_payments
  ADD COLUMN IF NOT EXISTS addon_bar_data  jsonb;

COMMENT ON COLUMN public.billing_payments.addon_bar_count
  IS 'Number of extra bars this payment covers (for addon plan types)';
COMMENT ON COLUMN public.billing_payments.addon_bar_data
  IS 'JSON array of {name, location, type} for each bar to be created on approval';

-- 3. Drop and recreate plan_type check constraint
--    Must include ALL plan_type values that exist in the table, including archived rows.
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

-- Normalize: any row whose plan_type is NULL or unrecognised gets set to 'basic'
-- so the new constraint won't fail on stale data.
UPDATE public.billing_plans
SET plan_type = 'basic'
WHERE plan_type IS NULL
   OR plan_type NOT IN (
      'basic', 'machines_addon', 'premium', 'chain',
      'machines_only', 'bar_addon',
      'bar_only_addon', 'machines_bar_addon'
   );

ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_type_check
  CHECK (plan_type IN (
    'basic', 'machines_addon', 'premium', 'chain',
    'machines_only', 'bar_addon',
    'bar_only_addon', 'machines_bar_addon',
    'premium_addon'
  ));

-- 4. Seed addon plans (idempotent)

-- Bar Only → extra bar at $1,200/yr each
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Bar Only — Extra Bar', 1200.00, 12, 'TT', 'bar_only_addon'
WHERE NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_type = 'bar_only_addon');

-- Machines Only → extra machines account at $1,200/yr each
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Machines Only — Extra Account', 1200.00, 12, 'TT', 'machines_bar_addon'
WHERE NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_type = 'machines_bar_addon');

-- Note: Premium (Bar with Machines) owners adding more bars upgrades them to Chain.
-- plan_type flips to 'chain' on approval. Each extra bar = $1,500.
-- Total new annual cost = $3,000 (premium base) + (N × $1,500).
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Bar with Machines — Extra Bar', 1500.00, 12, 'TT', 'premium_addon'
WHERE NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_type = 'premium_addon');