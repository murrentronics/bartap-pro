-- ============================================================
-- Pricing update — September 2026
--
-- Bar Only (basic):                    $1,800/yr  (was $1,200)
-- Machines Only 10-screen:             $1,800/yr  (was $2,400)
-- Machines Only 20-screen:             $2,400/yr  (was $3,000)
--
-- Extra Bar Only addon:                $1,200/yr  (was $800)
-- Extra Machines 10-screen addon:      $1,200/yr  (unchanged)
-- Extra Machines 20-screen addon:      $1,800/yr  (was $1,500)
--
-- Bar with Machines 10-screen:         $3,000/yr  (unchanged)
-- Bar with Machines 20-screen:         $3,500/yr  (unchanged)
-- Bar+10 Machines extra bar addon:     $2,000/yr  (unchanged)
-- Bar+20 Machines extra bar addon:     $2,500/yr  (unchanged)
-- ============================================================

-- 1. Bar Only base plan: $1,200 → $1,800
UPDATE public.billing_plans
SET amount = 1800.00
WHERE plan_type = 'basic'
  AND name NOT ILIKE '[Archived]%';

-- 2. Machines Only 10-screen: $2,400 → $1,800
UPDATE public.billing_plans
SET amount = 1800.00
WHERE plan_type = 'machines_only'
  AND name NOT ILIKE '[Archived]%';

-- 3. Machines Only 20-screen: $3,000 → $2,400
UPDATE public.billing_plans
SET amount = 2400.00
WHERE plan_type = 'machines_only_20'
  AND name NOT ILIKE '[Archived]%';

-- 4. Extra Bar Only addon: $800 → $1,200
UPDATE public.billing_plans
SET amount = 1200.00
WHERE plan_type = 'bar_only_addon'
  AND name NOT ILIKE '[Archived]%';

-- 5. Extra Machines 20-screen addon: $1,500 → $1,800
UPDATE public.billing_plans
SET amount = 1800.00
WHERE plan_type = 'machines_bar_addon_20'
  AND name NOT ILIKE '[Archived]%';

-- No changes needed:
--   machines_bar_addon  stays at $1,200
--   premium             stays at $3,000
--   premium_20          stays at $3,500
--   premium_addon       stays at $2,000
--   premium_addon_20    stays at $2,500
