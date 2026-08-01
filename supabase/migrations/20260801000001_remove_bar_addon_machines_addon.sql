-- ============================================================
-- Remove bar_addon and machines_addon plan types.
--
-- Upgrade paths are now:
--   Bar Only owner wanting Machines   → upgrade to Bar with Machines (premium)
--   Machines Only owner wanting Bar   → upgrade to Bar with Machines (premium)
--   Multiple Bar Only accounts        → upgrade to Chain
--   Multiple Machines Only accounts   → upgrade to Chain
--
-- This migration archives the two defunct plan rows and removes
-- them from the billing_plans CHECK constraint.
-- The bar_addon_active column is also cleared since it no longer
-- has a corresponding purchasable plan.
-- ============================================================

-- 1. Archive the two obsolete plan rows (soft-delete by prepending [Archived])
UPDATE public.billing_plans
SET name = '[Archived] ' || name
WHERE plan_type IN ('bar_addon', 'machines_addon')
  AND name NOT ILIKE '[Archived]%';

-- 2. Drop all existing plan_type check constraints on billing_plans
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_plan_type_check;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.billing_plans'::regclass
      AND contype  = 'c'
      AND conname  LIKE '%plan_type%'
  LOOP
    EXECUTE 'ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- 3. Normalise any stale rows before adding constraint
UPDATE public.billing_plans
SET plan_type = 'basic'
WHERE plan_type IS NULL
   OR plan_type NOT IN (
      'basic', 'premium', 'chain',
      'machines_only', 'machines_only_20',
      'bar_only_addon',
      'machines_bar_addon', 'machines_bar_addon_20',
      'premium_addon', 'premium_addon_20',
      -- keep legacy values so archived rows don't violate the constraint
      'bar_addon', 'machines_addon'
   );

-- 4. Re-add constraint — bar_addon and machines_addon kept only for archived
--    historical rows; they will never be offered as selectable plans again.
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_type_check
  CHECK (plan_type IN (
    'basic',
    'premium', 'premium_20',
    'chain',
    'machines_only', 'machines_only_20',
    'bar_only_addon',
    'machines_bar_addon', 'machines_bar_addon_20',
    'premium_addon', 'premium_addon_20',
    -- legacy archived rows
    'bar_addon', 'machines_addon'
  ));

-- 5. Clear bar_addon_active on any profiles where it was set
--    (no longer a purchasable state — those owners should upgrade to premium)
UPDATE public.profiles
SET bar_addon_active = false
WHERE bar_addon_active = true;
