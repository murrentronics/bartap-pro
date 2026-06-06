-- ─── Opened Bottles ──────────────────────────────────────────────────────────
-- Tracks which liquor bottles are currently open, how many shots sold,
-- and revenue generated. Finished when cashier marks it empty/done.

CREATE TABLE public.opened_bottles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  shot_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  shots_sold   INTEGER NOT NULL DEFAULT 0,
  revenue      NUMERIC(12,2) NOT NULL DEFAULT 0,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'open'  -- 'open' | 'finished'
);

ALTER TABLE public.opened_bottles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View opened_bottles in scope" ON public.opened_bottles FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Insert opened_bottles in scope" ON public.opened_bottles FOR INSERT
  WITH CHECK (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Update opened_bottles in scope" ON public.opened_bottles FOR UPDATE
  USING (owner_id = public.get_owner_id(auth.uid()));


-- ─── RPC: open_bottle ─────────────────────────────────────────────────────────
-- Decrements product stock by 1 and creates an opened_bottles row.
-- SECURITY DEFINER so cashiers can call it.
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

  INSERT INTO public.opened_bottles (owner_id, product_id, product_name, shot_price)
  VALUES (p_owner_id, p_product_id, v_name, p_shot_price)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_bottle(UUID, UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_bottle(UUID, UUID, NUMERIC) TO authenticated;


-- ─── RPC: record_shot ─────────────────────────────────────────────────────────
-- Increments shots_sold and revenue on an opened bottle.
-- Called when an order containing a shot is confirmed.
CREATE OR REPLACE FUNCTION public.record_shot(
  p_bottle_id UUID,
  p_qty       INTEGER,
  p_revenue   NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.opened_bottles
     SET shots_sold = shots_sold + p_qty,
         revenue    = revenue + p_revenue
   WHERE id = p_bottle_id AND status = 'open';
END;
$$;

REVOKE ALL ON FUNCTION public.record_shot(UUID, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_shot(UUID, INTEGER, NUMERIC) TO authenticated;


-- ─── RPC: finish_bottle ───────────────────────────────────────────────────────
-- Marks a bottle as finished and inserts a record-only wallet_transaction.
-- Does NOT add to wallet balance — shots were already counted as regular sales.
CREATE OR REPLACE FUNCTION public.finish_bottle(
  p_bottle_id  UUID,
  p_cashier_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revenue      NUMERIC;
  v_name         TEXT;
  v_product_id   UUID;
  v_bottle_price NUMERIC;
BEGIN
  SELECT revenue, product_name, product_id
    INTO v_revenue, v_name, v_product_id
    FROM public.opened_bottles
   WHERE id = p_bottle_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bottle not found or already finished';
  END IF;

  -- Get the original product price for the record
  SELECT price INTO v_bottle_price
    FROM public.products
   WHERE id = v_product_id;

  UPDATE public.opened_bottles
     SET status      = 'finished',
         finished_at = now()
   WHERE id = p_bottle_id;

  -- Record-only wallet transaction — amount 0 so balance is NOT affected.
  -- Note shows bottle name, what it cost, and what it made from shots.
  INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
  VALUES (
    p_cashier_id,
    0,
    'bottle_finished',
    'Open bottle sold out: ' || v_name
      || ' | Bottle price: $' || COALESCE(v_bottle_price::text, '?')
      || ' | Shots revenue: $' || v_revenue::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_bottle(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_bottle(UUID, UUID) TO authenticated;
