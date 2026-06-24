-- Add cost_price to products (purchase/wholesale price per unit)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Add stock_last_expense_id to products so we can delete the auto-generated
-- expense when the owner undoes the last stock quantity change
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_last_expense_id UUID REFERENCES public.owner_expenses(id) ON DELETE SET NULL;
