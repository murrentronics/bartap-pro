-- Add cashier_shift_start to profiles.
-- When the owner clears a cashier's wallet, this timestamp is updated.
-- The cashier's view filters wallet/expense records to only show entries
-- created after cashier_shift_start, so previous shift records are hidden.
-- Owner always sees all records (7-year retention).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cashier_shift_start TIMESTAMPTZ;
