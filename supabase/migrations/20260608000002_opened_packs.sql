-- ─── Opened Cigarette Packs ──────────────────────────────────────────────────
-- Tracks open cigarette packs (retail singles) and rolling paper packs.
-- pack_type: 'retail' = single cigarettes | 'paper' = rolling papers
-- Mirrors the opened_bottles system exactly.

CREATE TABLE IF NOT EXISTS public.opened_packs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id    UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name  TEXT NOT NULL,
  pack_type     TEXT NOT NULL DEFAULT 'retail',   -- 'retail' | 'paper'
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0, -- price per cigarette or per sheet
  units_sold    INTEGER NOT NULL DEFAULT 0,
  revenue       NUMERIC(12,2) NOT NULL DEFAULT 0,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'open'      -- 'open' | 'finished'
);

ALTER TABLE public.opened_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View opened_packs in scope" ON public.opened_packs FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Insert opened_packs in scope" ON public.opened_packs FOR INSERT
  WITH CHECK (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Update opened_packs in scope" ON public.opened_packs FOR UPDATE
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Delete opened_packs in scope" ON public.opened_packs FOR DELETE
  USING (owner_id = public.get_owner_id(auth.uid()));

-- Realtime
ALTER TABLE public.opened_packs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.opened_packs;

-- ─── RPC: open_pack ───────────────────────────────────────────────────────────
-- Decrements product stock by 1 and creates an opened_packs row.
CREATE OR REPLACE FUNCTION public.open_pack(
  p_owner_id   UUID,
  p_product_id UUID,
  p_pack_type  TEXT,      -- 'retail' | 'paper'
  p_unit_price NUMERIC
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;

  -- Decrement stock (clamp at 0)
  UPDATE public.products
     SET stock_qty = GREATEST(0, stock_qty - 1)
   WHERE id = p_product_id;

  INSERT INTO public.opened_packs (owner_id, product_id, product_name, pack_type, unit_price)
  VALUES (p_owner_id, p_product_id, v_name, p_pack_type, p_unit_price)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_pack(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_pack(UUID, UUID, TEXT, NUMERIC) TO authenticated;


-- ─── RPC: record_pack_unit ────────────────────────────────────────────────────
-- Increments units_sold + revenue on an open pack.
-- Called at order confirm time for each pack unit in the cart.
CREATE OR REPLACE FUNCTION public.record_pack_unit(
  p_pack_id UUID,
  p_qty     INTEGER,
  p_revenue NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.opened_packs
     SET units_sold = units_sold + p_qty,
         revenue    = revenue + p_revenue
   WHERE id = p_pack_id AND status = 'open';
END;
$$;

REVOKE ALL ON FUNCTION public.record_pack_unit(UUID, INTEGER, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pack_unit(UUID, INTEGER, NUMERIC) TO authenticated;


-- ─── RPC: finish_pack ─────────────────────────────────────────────────────────
-- Marks a pack as finished. Records a zero-amount wallet entry (paper trail only).
-- Units were already counted as regular sales — same as finish_bottle.
CREATE OR REPLACE FUNCTION public.finish_pack(
  p_pack_id    UUID,
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
  v_pack_price   NUMERIC;
  v_pack_type    TEXT;
  v_units        INTEGER;
  v_unit_label   TEXT;
BEGIN
  SELECT revenue, product_name, product_id, pack_type, units_sold
    INTO v_revenue, v_name, v_product_id, v_pack_type, v_units
    FROM public.opened_packs
   WHERE id = p_pack_id AND status = 'open';

  IF NOT FOUND THEN RAISE EXCEPTION 'Pack not found or already finished'; END IF;

  SELECT price INTO v_pack_price FROM public.products WHERE id = v_product_id;

  v_unit_label := CASE WHEN v_pack_type = 'paper' THEN 'papers' ELSE 'cigarettes' END;

  UPDATE public.opened_packs
     SET status = 'finished', finished_at = now()
   WHERE id = p_pack_id;

  -- Zero-amount wallet record — balance unchanged, shots revenue already banked
  INSERT INTO public.wallet_transactions (profile_id, amount, type, note)
  VALUES (
    p_cashier_id,
    0,
    'pack_finished',
    'Pack sold out: ' || v_name
      || ' (' || v_pack_type || ')'
      || ' | Pack price: $' || COALESCE(v_pack_price::text, '?')
      || ' | ' || v_units || ' ' || v_unit_label || ' sold'
      || ' | Revenue: $' || COALESCE(v_revenue::text, '0')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_pack(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_pack(UUID, UUID) TO authenticated;


-- ─── RPC: cancel_pack ─────────────────────────────────────────────────────────
-- Removes an opened pack (only if 0 units sold) and restores 1 stock.
CREATE OR REPLACE FUNCTION public.cancel_pack(p_pack_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_units      INTEGER;
BEGIN
  SELECT product_id, units_sold INTO v_product_id, v_units
    FROM public.opened_packs
   WHERE id = p_pack_id AND status = 'open';

  IF NOT FOUND THEN RAISE EXCEPTION 'Pack not found or already finished'; END IF;

  IF v_units > 0 THEN
    RAISE EXCEPTION 'Cannot cancel — units already sold from this pack';
  END IF;

  UPDATE public.products SET stock_qty = stock_qty + 1 WHERE id = v_product_id;
  DELETE FROM public.opened_packs WHERE id = p_pack_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_pack(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_pack(UUID) TO authenticated;
