-- Optional proof photo for payout records.
-- Cashier can photograph the winning screen before saving a payout.
-- NULL = no photo taken (flagged as unverified in the UI).

ALTER TABLE public.machine_entries
  ADD COLUMN IF NOT EXISTS proof_image_url TEXT;
