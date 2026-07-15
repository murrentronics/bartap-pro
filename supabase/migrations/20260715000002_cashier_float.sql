-- Add cashier_float to profiles: owner sets a cash float for bar cashiers to spend from.
-- Float is consumed first before the cashier's wallet_balance when recording expenses.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cashier_float NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cashier_float >= 0);
