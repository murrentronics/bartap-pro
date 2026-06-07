-- ─── Update open_bottle RPC ───────────────────────────────────────────────────
-- When opening a new bottle of the same product, automatically finish any
-- currently open bottle of that same product for this owner first.
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
  v_name         TEXT;
  v_id           UUID;
  v_prev_id      UUID;
  v_prev_revenue NUMERIC;
  v_bottle_price NUMERIC;
BEGIN
  SELECT name INTO v_name FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  -- Auto-finish any currently open bottle of the same product for this owner
  SELECT id, revenue INTO v_prev_id, v_prev_revenue
    FROM public.opened_bottles
   WHERE owner_id  = p_owner_id
     AND product_id = p_product_id
     AND status    = 'open'
   LIMIT 1;

  IF v_prev_id IS NOT NULL THEN
    SELECT price INTO v_bottle_price
      FROM public.products WHERE id = p_product_id;

    UPDATE public.opened_bottles
       SET status      = 'finished',
           finished_at = now()
     WHERE id = v_prev_id;

    -- Record-only wallet note for the auto-finished bottle
    INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
    VALUES (
      p_owner_id,
      0,
      'bottle_finished',
      'Open bottle sold out: ' || v_name
        || ' | Bottle price: $' || COALESCE(v_bottle_price::text, '?')
        || ' | Shots revenue: $' || COALESCE(v_prev_revenue::text, '0')
    );
  END IF;

  -- Decrement stock (clamp at 0)
  UPDATE public.products
     SET stock_qty = GREATEST(0, stock_qty - 1)
   WHERE id = p_product_id;

  -- Insert the new open bottle
  INSERT INTO public.opened_bottles (owner_id, product_id, product_name, shot_price)
  VALUES (p_owner_id, p_product_id, v_name, p_shot_price)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_bottle(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_bottle(UUID, UUID, NUMERIC) TO authenticated;
