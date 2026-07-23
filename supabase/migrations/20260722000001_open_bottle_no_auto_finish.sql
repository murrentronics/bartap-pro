-- ─── Fix open_bottle: remove auto-finish of existing bottles ─────────────────
-- Multiple open bottles of the same product must coexist.
-- The cashier/owner explicitly marks a bottle empty — we never close it automatically.
-- This restores the original behaviour: just decrement stock and insert a new row.
CREATE OR REPLACE FUNCTION public.open_bottle(
  p_owner_id   UUID,
  p_product_id UUID,
  p_shot_price NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_id   UUID;
BEGIN
  SELECT name INTO v_name FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Decrement stock (clamp at 0)
  UPDATE public.products
     SET stock_qty = GREATEST(0, stock_qty - 1)
   WHERE id = p_product_id;

  -- Insert the new open bottle — any previously open bottles of this product
  -- remain open until the cashier/owner explicitly marks them empty or cancels them.
  INSERT INTO public.opened_bottles (owner_id, product_id, product_name, shot_price)
  VALUES (p_owner_id, p_product_id, v_name, p_shot_price)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_bottle(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_bottle(UUID, UUID, NUMERIC) TO authenticated;
