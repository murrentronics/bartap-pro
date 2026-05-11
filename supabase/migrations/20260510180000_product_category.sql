ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'drinks';
