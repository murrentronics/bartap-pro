-- ─────────────────────────────────────────────────────────────────────────────
-- Sync actual_qty in stock_check_actuals whenever stock_qty changes on products.
--
-- Business rule:
--   actual_qty tracks the *physical* count set by an owner/manager during a
--   stock check. The gap (stock_qty − actual_qty) represents discrepancy/loss.
--   When stock_qty moves by a delta (sale, credit sale, stock addition, revert,
--   undo, opened bottles, etc.), actual_qty must move by the same delta so the
--   gap is preserved until the next stock check.
--
--   Example:
--     stock_qty = 30, actual_qty = 28  → 2 short
--     stock_qty becomes 35 (+5)        → actual_qty becomes 33 (+5), still 2 short
--     stock_qty becomes 27 (−3 sales)  → actual_qty becomes 25 (−3), still 2 short
--
--   If no actual row exists yet for a product, no row is inserted — the gap is
--   implicitly 0 until the owner does their first stock check.
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

  -- Apply the same delta to actual_qty, clamped to >= 0.
  -- If no actual row exists yet, insert one seeded at NEW.stock_qty
  -- (zero discrepancy) so all future deltas track correctly from day one.
  INSERT INTO public.stock_check_actuals (owner_id, product_id, actual_qty, updated_at)
  VALUES (NEW.owner_id, NEW.id, NEW.stock_qty, now())
  ON CONFLICT (owner_id, product_id) DO UPDATE
    SET actual_qty = GREATEST(0, stock_check_actuals.actual_qty + v_delta),
        updated_at = now();

  RETURN NEW;
END;
$$;

-- Drop & recreate so re-running this migration is idempotent
DROP TRIGGER IF EXISTS trg_sync_actual_qty ON public.products;

CREATE TRIGGER trg_sync_actual_qty
  AFTER UPDATE OF stock_qty ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_actual_qty_on_stock_change();
