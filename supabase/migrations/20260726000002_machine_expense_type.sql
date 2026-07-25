-- Allow 'expense' as a valid type in machine_entries
-- The original check constraint only permitted 'payout' and 'income'.

ALTER TABLE public.machine_entries
  DROP CONSTRAINT IF EXISTS machine_entries_type_check;

ALTER TABLE public.machine_entries
  ADD CONSTRAINT machine_entries_type_check
    CHECK (type IN ('payout', 'income', 'expense'));
