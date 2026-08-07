-- Add is_open flag to stock_check_actuals so open bottle/pack actuals
-- can be stored separately from sealed actuals for the same product.
-- The old unique constraint (owner_id, product_id) is replaced with
-- (owner_id, product_id, is_open).

alter table stock_check_actuals
  add column if not exists is_open boolean not null default false;

-- Drop old unique constraint and recreate with is_open included
alter table stock_check_actuals
  drop constraint if exists stock_check_actuals_owner_id_product_id_key;

alter table stock_check_actuals
  drop constraint if exists stock_check_actuals_owner_product_open_key;

alter table stock_check_actuals
  add constraint stock_check_actuals_owner_product_open_key
  unique (owner_id, product_id, is_open);

-- ── Update the sync trigger to use the new constraint ────────────────────────
-- The trigger only ever touches sealed (is_open = false) actuals because it
-- tracks stock_qty changes, not open bottle/pack drink counts.
CREATE OR REPLACE FUNCTION public.sync_actual_qty_on_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta INTEGER;
BEGIN
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
