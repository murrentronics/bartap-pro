-- Add scheduling columns to cashier_salaries if they don't exist yet
ALTER TABLE public.cashier_salaries
  ADD COLUMN IF NOT EXISTS next_pay_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_paid_at TIMESTAMPTZ;

-- Also make frequency nullable (for pay-now-only records)
ALTER TABLE public.cashier_salaries
  ALTER COLUMN frequency DROP NOT NULL;
