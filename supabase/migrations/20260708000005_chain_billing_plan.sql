-- Add 'chain' to billing_plans plan_type constraint and seed the plan row
-- ============================================================

-- 1. Drop the existing check constraint (must drop before altering)
ALTER TABLE public.billing_plans DROP CONSTRAINT IF EXISTS billing_plans_plan_type_check;

-- 2. Also drop any dynamically-named variants
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

-- 3. Re-add constraint including 'chain'
ALTER TABLE public.billing_plans
  ADD CONSTRAINT billing_plans_plan_type_check
  CHECK (plan_type IN ('basic', 'machines_addon', 'premium', 'chain'));

-- 4. Insert the Chain of Bars plan — idempotent
INSERT INTO public.billing_plans (name, amount, duration_months, currency, plan_type)
SELECT 'Chain of Bars Plan', 3000.00, 12, 'TT', 'chain'
WHERE NOT EXISTS (
  SELECT 1 FROM public.billing_plans WHERE plan_type = 'chain'
);
