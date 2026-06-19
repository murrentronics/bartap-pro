-- ─────────────────────────────────────────────────────────────────────────────
-- Replace old plans with single Annual Plan ($750/yr)
-- First-year total = $1000 TT (includes training & installation)
-- The $250 setup fee logic in the app handles the first-year premium automatically.
-- ─────────────────────────────────────────────────────────────────────────────

-- Archive old plans so existing payment records keep their foreign key
UPDATE public.billing_plans
SET name = '[Archived] ' || name
WHERE name NOT ILIKE '[Archived]%';

-- Insert the single active plan
INSERT INTO public.billing_plans (name, amount, duration_months, currency)
VALUES ('Annual Plan', 750.00, 12, 'TT');
