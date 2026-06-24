-- Add cashier tracking to machine_entries
-- cashier_id : profile id of whoever saved the record (owner or cashier)
-- cashier_name : snapshot of their username at save time (no join needed)

ALTER TABLE public.machine_entries
  ADD COLUMN IF NOT EXISTS cashier_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cashier_name TEXT;
