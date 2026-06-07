-- ─── RPC: cancel_bottle ──────────────────────────────────────────────────────
-- Removes an opened bottle record (only if 0 shots sold) and restores 1 stock.
CREATE OR REPLACE FUNCTION public.cancel_bottle(p_bottle_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_shots      INTEGER;
BEGIN
  SELECT product_id, shots_sold INTO v_product_id, v_shots
    FROM public.opened_bottles
   WHERE id = p_bottle_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bottle not found or already finished';
  END IF;

  IF v_shots > 0 THEN
    RAISE EXCEPTION 'Cannot cancel — shots already sold from this bottle';
  END IF;

  -- Restore 1 unit to stock
  UPDATE public.products
     SET stock_qty = stock_qty + 1
   WHERE id = v_product_id;

  -- Remove the record entirely
  DELETE FROM public.opened_bottles WHERE id = p_bottle_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_bottle(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_bottle(UUID) TO authenticated;
