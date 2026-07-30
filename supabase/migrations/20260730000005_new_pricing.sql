-- ============================================================
-- New pricing update (2026-07-30)
--
-- Bar Only (basic):             $1,200/yr (was $2,400)
-- Bar extra bar addon:          $800/yr each (pro-rata on activation, full at renewal)
-- Renewal for Bar Only:         $1,200 + ($800 × extra_bar_count)
--
-- Machines Only 10-screen:      $2,400/yr (unchanged)
-- Machines Only 20-screen:      $3,000/yr (new plan type: machines_only_20)
-- Machines Only addon 10-screen: $1,200 each (unchanged)
-- Machines Only addon 20-screen: $1,500 each (new plan type: machines_bar_addon_20)
--
-- Bar with Machines 10-screen:  $3,000/yr (unchanged)
-- Bar with Machines 20-screen:  $3,500/yr (new plan type: premium_20)
-- Bar+Machines addon (bar + 10 screen): $2,000 each (was $1,500, plan_type: premium_addon)
-- Bar+Machines addon (bar + 20 screen): $2,500 each (new plan type: premium_addon_20)
-- ============================================================

-- 1. Update Bar Only price: $2,400 → $1,200
UPDATE public.billing_plans
SET amount = 1200.00
WHERE plan_type = 'basic'
  AND name NOT ILIKE '[Archived]%';

-- 2. Update bar_only_addon (extra bar for Bar Only owners): $1,200 → $800
UPDATE public.billing_plans
SET amount = 800.00
WHERE plan_type = 'bar_only_addon'
  AND name NOT ILIKE '[Archived]%';

-- 3. Update premium_addon (extra bar for Bar+Machines owners): $1,500 → $2,000
UPDATE public.billing_plans
SET amount = 2000.00
WHERE plan_type = 'premium_addon'
  AND name NOT ILIKE '[Archived]%';

-- 4. Drop and recreate plan_type check constraint to include new types
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

-- Normalize any stale plan_types before adding constraint
UPDATE public.billing_plans
SET plan_type = 'basic'
WHERE plan_type IS NULL
   OR plan_type NOT IN (
      'basic', 'machines_addon', 'premium', 'chain',
      'machines_only', 'bar_addon',
      'bar_only_addon', 'machines_bar_addon', 'premium_addon',
      'machines_only_20', 'machines_bar_addon_20', 'premium_20', 'premium_addon_20'
   );

ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_type_check
  CHECK (plan_type IN (
    'basic', 'machines_addon', 'premium', 'chain',
    'machines_only', 'bar_addon',
    'bar_only_addon', 'machines_bar_addon', 'premium_addon',
    'machines_only_20', 'machines_bar_addon_20', 'premium_20', 'premium_addon_20'
  ));

-- 5. Insert new plan: Machines Only 20-screen ($3,000/yr)
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Machines Only (20 Screens)', 3000.00, 12, 'TT', 'machines_only_20'
WHERE NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_type = 'machines_only_20');

-- 6. Insert new plan: Bar with Machines 20-screen ($3,500/yr)
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Bar with Machines (20 Screens)', 3500.00, 12, 'TT', 'premium_20'
WHERE NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_type = 'premium_20');

-- 7. Insert new addon: Machines Only extra 20-screen account ($1,500 each)
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Machines Only (20 Screens) — Extra Account', 1500.00, 12, 'TT', 'machines_bar_addon_20'
WHERE NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_type = 'machines_bar_addon_20');

-- 8. Insert new addon: Bar with Machines extra bar + 20-screen ($2,500 each)
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Bar with Machines (20 Screens) — Extra Bar', 2500.00, 12, 'TT', 'premium_addon_20'
WHERE NOT EXISTS (SELECT 1 FROM public.billing_plans WHERE plan_type = 'premium_addon_20');

-- 9. Also update profiles plan_type check if it exists
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND conname LIKE '%plan_type%'
  LOOP
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;
