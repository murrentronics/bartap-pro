-- Track when the owner last reset/updated the cashier float.
-- Only cashier_expense transactions AFTER this timestamp count toward "used".
-- This lets the owner reset the float and have used/remaining snap back to 0 / full amount.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cashier_float_set_at TIMESTAMPTZ;
