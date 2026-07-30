-- ============================================================
-- Rebrand plans and update pricing
--   basic    → "Bar Only"           $2,400/yr
--   machines_only → "Machines Only" $2,400/yr  (name unchanged, price updated)
--   premium  → "Bar with Machines"  $3,000/yr  (relabelled from Premium)
-- ============================================================

-- 1. Update Basic plan: rename to "Bar Only" and set price to $2,400
UPDATE public.billing_plans
SET name = 'Bar Only', amount = 2400.00
WHERE plan_type = 'basic'
  AND name NOT ILIKE '[Archived]%';

-- 2. Update Machines Only plan price to $2,400
UPDATE public.billing_plans
SET amount = 2400.00
WHERE plan_type = 'machines_only'
  AND name NOT ILIKE '[Archived]%';

-- 3. Rename Premium plan to "Bar with Machines" and set price to $3,000
UPDATE public.billing_plans
SET name = 'Bar with Machines', amount = 3000.00
WHERE plan_type = 'premium'
  AND name NOT ILIKE '[Archived]%';
