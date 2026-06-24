-- Add sort_order to products for owner/cashier drag-to-reorder on the bar page.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_sort_order
  ON public.products (owner_id, sort_order);
