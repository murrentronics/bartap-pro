ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'beers';

CREATE INDEX IF NOT EXISTS products_owner_category_idx ON public.products(owner_id, category);