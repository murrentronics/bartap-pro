-- ── 1. Add reference_id to wallet_transactions ───────────────────────────────
-- Stores the opened_bottles.id or opened_packs.id that generated this tx.
-- Nullable — only set for bottle_finished and pack_finished types.
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS reference_id UUID;

-- ── 2. Update finish_bottle to store reference_id ─────────────────────────────
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
  v_owner_id     UUID;
  v_bottle_price NUMERIC;
  v_note         TEXT;
  v_cashier_name TEXT;
  v_gain_loss    NUMERIC;
BEGIN
  SELECT revenue, product_name, product_id, owner_id
    INTO v_revenue, v_name, v_product_id, v_owner_id
    FROM public.opened_bottles
   WHERE id = p_bottle_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bottle not found or already finished';
  END IF;

  SELECT price INTO v_bottle_price FROM public.products WHERE id = v_product_id;
  SELECT username INTO v_cashier_name FROM public.profiles WHERE id = p_cashier_id;

  v_gain_loss := COALESCE(v_revenue, 0) - COALESCE(v_bottle_price, 0);

  v_note := 'Bottle closed: ' || v_name
    || ' | Bottle price: $' || COALESCE(v_bottle_price::text, '?')
    || ' | Shots revenue: $' || COALESCE(v_revenue::text, '0')
    || ' | ' || CASE WHEN v_gain_loss >= 0 THEN 'Gain' ELSE 'Loss' END
    || ': $' || ABS(v_gain_loss)::text;

  UPDATE public.opened_bottles
     SET status = 'finished', finished_at = now()
   WHERE id = p_bottle_id;

  -- Cashier record (only if cashier ≠ owner)
  IF p_cashier_id != v_owner_id THEN
    INSERT INTO public.wallet_transactions (profile_id, amount, type, note, reference_id)
    VALUES (
      p_cashier_id, 0, 'bottle_finished',
      v_note || COALESCE(' | By: ' || v_cashier_name, ''),
      p_bottle_id
    );
  END IF;

  -- Owner record — always
  INSERT INTO public.wallet_transactions (profile_id, amount, type, note, reference_id)
  VALUES (
    v_owner_id, 0, 'bottle_finished',
    v_note || CASE WHEN p_cashier_id != v_owner_id
                   THEN ' | By: ' || COALESCE(v_cashier_name, 'Cashier')
                   ELSE '' END,
    p_bottle_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_bottle(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_bottle(UUID, UUID) TO authenticated;

-- ── 3. Update finish_pack to store reference_id ───────────────────────────────
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
  v_owner_id     UUID;
  v_pack_price   NUMERIC;
  v_pack_type    TEXT;
  v_units        INTEGER;
  v_unit_label   TEXT;
  v_gain_loss    NUMERIC;
  v_cashier_name TEXT;
  v_note         TEXT;
BEGIN
  SELECT revenue, product_name, product_id, owner_id, pack_type, units_sold
    INTO v_revenue, v_name, v_product_id, v_owner_id, v_pack_type, v_units
    FROM public.opened_packs
   WHERE id = p_pack_id AND status = 'open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pack not found or already finished';
  END IF;

  SELECT price INTO v_pack_price FROM public.products WHERE id = v_product_id;
  SELECT username INTO v_cashier_name FROM public.profiles WHERE id = p_cashier_id;

  v_unit_label := CASE WHEN v_pack_type = 'paper' THEN 'papers' ELSE 'cigarettes' END;
  v_gain_loss  := COALESCE(v_revenue, 0) - COALESCE(v_pack_price, 0);

  v_note := 'Pack sold out: ' || v_name
    || ' (' || v_pack_type || ')'
    || ' | Pack price: $'  || COALESCE(v_pack_price::text, '?')
    || ' | '               || v_units || ' ' || v_unit_label || ' sold'
    || ' | Revenue: $'     || COALESCE(v_revenue::text, '0')
    || ' | '               || CASE WHEN v_gain_loss >= 0 THEN 'Gain' ELSE 'Loss' END
    || ': $'               || ABS(v_gain_loss)::text;

  UPDATE public.opened_packs
     SET status = 'finished', finished_at = now()
   WHERE id = p_pack_id;

  -- Cashier record (only if cashier ≠ owner)
  IF p_cashier_id != v_owner_id THEN
    INSERT INTO public.wallet_transactions (profile_id, amount, type, note, reference_id)
    VALUES (
      p_cashier_id, 0, 'pack_finished',
      v_note || ' | By: ' || COALESCE(v_cashier_name, 'Cashier'),
      p_pack_id
    );
  END IF;

  -- Owner record — always
  INSERT INTO public.wallet_transactions (profile_id, amount, type, note, reference_id)
  VALUES (
    v_owner_id, 0, 'pack_finished',
    v_note || CASE WHEN p_cashier_id != v_owner_id
                   THEN ' | By: ' || COALESCE(v_cashier_name, 'Cashier')
                   ELSE '' END,
    p_pack_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_pack(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_pack(UUID, UUID) TO authenticated;

-- ── 4. RPC: undo_finish_bottle ────────────────────────────────────────────────
-- Reopens a finished bottle and deletes all wallet_transactions for that finish.
-- Only the owner (or the scope of get_owner_id) can call this.
CREATE OR REPLACE FUNCTION public.undo_finish_bottle(
  p_bottle_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id
    FROM public.opened_bottles
   WHERE id = p_bottle_id AND status = 'finished';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finished bottle not found';
  END IF;

  -- Only the owner in scope can undo
  IF v_owner_id != public.get_owner_id(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Reopen the bottle
  UPDATE public.opened_bottles
     SET status = 'open', finished_at = NULL
   WHERE id = p_bottle_id;

  -- Delete all wallet_transactions tied to this finish (both owner + cashier rows)
  DELETE FROM public.wallet_transactions
   WHERE reference_id = p_bottle_id
     AND type = 'bottle_finished';
END;
$$;

REVOKE ALL ON FUNCTION public.undo_finish_bottle(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_finish_bottle(UUID) TO authenticated;

-- ── 5. RPC: undo_finish_pack ──────────────────────────────────────────────────
-- Reopens a finished pack and deletes all wallet_transactions for that finish.
CREATE OR REPLACE FUNCTION public.undo_finish_pack(
  p_pack_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id
    FROM public.opened_packs
   WHERE id = p_pack_id AND status = 'finished';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Finished pack not found';
  END IF;

  IF v_owner_id != public.get_owner_id(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Reopen the pack
  UPDATE public.opened_packs
     SET status = 'open', finished_at = NULL
   WHERE id = p_pack_id;

  -- Delete all wallet_transactions tied to this finish
  DELETE FROM public.wallet_transactions
   WHERE reference_id = p_pack_id
     AND type = 'pack_finished';
END;
$$;

REVOKE ALL ON FUNCTION public.undo_finish_pack(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_finish_pack(UUID) TO authenticated;
