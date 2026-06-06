-- ─── Simplify to 2 plans, music included in both ─────────────────────────────
-- We CANNOT delete old billing_plans rows — billing_payments references them.
-- Instead: rename old plans so they won't appear as new choices, then insert
-- the two new plans. The old rows stay for historical payment record integrity.

-- Step 1: Archive old plan names so they are no longer selectable
UPDATE public.billing_plans SET name = '[Archived] ' || name
WHERE name IN (
  '6 Month Plan',
  'Annual Plan',
  'Music Addon - 6 Month',
  'Music Addon - Annual',
  'Music Upgrade - 6 Month',
  'Music Upgrade - Annual'
);

-- Step 2: Insert the two new all-inclusive plans (idempotent)
INSERT INTO public.billing_plans (name, amount, duration_months, currency)
VALUES
  ('6 Month Plan', 450.00, 6,  'TT'),
  ('Annual Plan',  750.00, 12, 'TT')
ON CONFLICT DO NOTHING;

-- Step 3: Grant music_addon to all currently active owners
UPDATE public.profiles
SET music_addon = true
WHERE role = 'owner'
  AND billing_status = 'active';
