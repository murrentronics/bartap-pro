-- Stores the pre-edit qty so the owner can undo the last stock addition.
-- stock_qty_undo:       the qty BEFORE the last add (what to revert to)
-- stock_qty_undo_saved: the qty AFTER the last add (baseline — if current drops below this, sales happened)
-- Both are NULL when no undo is available.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_qty_undo       INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stock_qty_undo_saved INTEGER DEFAULT NULL;
