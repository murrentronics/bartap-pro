-- Stores the pre-edit qty so the owner can undo the last stock addition.
-- NULL means no undo available. Cleared after undo is used.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_qty_undo INTEGER DEFAULT NULL;

-- Stores the qty that was set during the last stock add (the "after" value).
-- If currentQty < stock_qty_undo_saved, a sale happened — undo is disabled.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_qty_undo_saved INTEGER DEFAULT NULL;
