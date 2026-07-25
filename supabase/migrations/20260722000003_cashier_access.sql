-- ─── Add cashier_access column to profiles ────────────────────────────────────
-- Values: 'bar' | 'machines' | 'both'
-- NULL means legacy cashier (defaults to bar access for backwards compatibility)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cashier_access TEXT DEFAULT 'bar';
