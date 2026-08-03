-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: sync_actual_qty_on_stock_change now upserts instead of only updating.
--
-- Previous version skipped products with no existing actual row, so the first
-- stock addition after a fresh item was added never propagated to actual_qty.
--
-- New behaviour:
--   • Row exists  → apply delta (GREATEST 0), preserving the discrepancy gap
--   • Row missing → insert with actual_qty = NEW.stock_qty (0 discrepancy),
--                   so all future deltas track from this point forward
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_actual_qty_on_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta INTEGER;
BEGIN
  -- Only act when stock_qty actually changed
  IF NEW.stock_qty IS NOT DISTINCT FROM OLD.stock_qty THEN
    RETURN NEW;
  END IF;

  v_delta := NEW.stock_qty - OLD.stock_qty;

  -- Upsert: if row exists apply delta, if not insert seeded at NEW.stock_qty
  -- (zero discrepancy — first stock check will establish the real baseline).
  INSERT INTO public.stock_check_actuals (owner_id, product_id, actual_qty, updated_at)
  VALUES (NEW.owner_id, NEW.id, NEW.stock_qty, now())
  ON CONFLICT (owner_id, product_id) DO UPDATE
    SET actual_qty = GREATEST(0, stock_check_actuals.actual_qty + v_delta),
        updated_at = now();

  RETURN NEW;
END;
$$;
