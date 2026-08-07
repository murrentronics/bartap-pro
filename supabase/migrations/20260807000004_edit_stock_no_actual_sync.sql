-- ─────────────────────────────────────────────────────────────────────────────
-- When a sale is edited, stock is adjusted (old items restored, new items
-- decremented) but the stock_check_actuals table must NOT be touched — the
-- owner already physically counted the shelf; correcting a sale record
-- doesn't change what's physically there.
--
-- Approach:
--   1. Add a session-level flag  app.skip_actual_sync
--   2. sync_actual_qty_on_stock_change() checks the flag and bails early
--   3. New RPC  adjust_stock_for_edit(p_restore JSONB, p_deduct JSONB)
--      sets the flag, restores old stock, deducts new stock, clears the flag —
--      all within a single transaction so the flag is session-scoped.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Patch the trigger to honour the skip flag
CREATE OR REPLACE FUNCTION public.sync_actual_qty_on_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta INTEGER;
BEGIN
  -- Skip when called from an edit-mode stock correction
  IF current_setting('app.skip_actual_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.stock_qty IS NOT DISTINCT FROM OLD.stock_qty THEN
    RETURN NEW;
  END IF;

  v_delta := NEW.stock_qty - OLD.stock_qty;

  INSERT INTO public.stock_check_actuals (owner_id, product_id, is_open, actual_qty, updated_at)
  VALUES (NEW.owner_id, NEW.id, false, NEW.stock_qty, now())
  ON CONFLICT (owner_id, product_id, is_open) DO UPDATE
    SET actual_qty = GREATEST(0, stock_check_actuals.actual_qty + v_delta),
        updated_at = now();

  RETURN NEW;
END;
$$;

-- 2. RPC that applies net stock changes for an order edit without syncing actuals
--    p_restore : JSONB array [{id, qty}]  — items from the OLD order (stock goes back up)
--    p_deduct  : JSONB array [{id, qty}]  — items from the NEW order (stock goes down)
CREATE OR REPLACE FUNCTION public.adjust_stock_for_edit(
  p_restore JSONB,
  p_deduct  JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
BEGIN
  -- Suppress actual-sync trigger for the duration of this transaction
  PERFORM set_config('app.skip_actual_sync', 'on', true);

  -- Restore stock for old items
  FOR item IN SELECT * FROM jsonb_array_elements(p_restore)
  LOOP
    UPDATE public.products
    SET stock_qty = stock_qty + (item->>'qty')::integer
    WHERE id = (item->>'id')::uuid;
  END LOOP;

  -- Deduct stock for new items
  FOR item IN SELECT * FROM jsonb_array_elements(p_deduct)
  LOOP
    UPDATE public.products
    SET stock_qty = GREATEST(0, stock_qty - (item->>'qty')::integer)
    WHERE id = (item->>'id')::uuid;
  END LOOP;

  -- Clear the flag (true = transaction-local, cleared automatically at commit
  -- but being explicit is safer)
  PERFORM set_config('app.skip_actual_sync', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_stock_for_edit(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock_for_edit(jsonb, jsonb) TO authenticated;
