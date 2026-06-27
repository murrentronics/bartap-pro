-- ─────────────────────────────────────────────────────────────────────────────
-- Reverse shot / pack-unit records when a sale order is deleted.
-- Called from the client inside deleteLatestOrder before the order row is gone.
--
-- Logic for each item in the order whose id starts with "shot-" or "pack-":
--   • Parse the bottle/pack UUID from the synthetic item id
--     (format: "shot-{uuid}-{timestamp}" or "pack-{uuid}-{timestamp}")
--   • If the bottle/pack is currently 'finished', reopen it first
--     (removes the bottle_finished / pack_finished wallet_transactions too)
--   • Decrement shots_sold / units_sold and revenue on the opened row
--   • Clamp at zero so we never go negative
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reverse_order_shot_pack(
  p_items JSONB   -- the full order.items array, same shape stored in orders.items
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item       JSONB;
  v_item_id    TEXT;
  v_item_qty   INTEGER;
  v_item_price NUMERIC;
  v_revenue    NUMERIC;
  v_uuid_str   TEXT;
  v_bottle_id  UUID;
  v_pack_id    UUID;
  v_status     TEXT;
  v_owner_id   UUID;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_item_id    := v_item->>'id';
    v_item_qty   := COALESCE((v_item->>'qty')::integer, 1);
    v_item_price := COALESCE((v_item->>'price')::numeric, 0);
    v_revenue    := v_item_qty * v_item_price;

    -- ── Shot item: id = "shot-{uuid}-{timestamp}" ──────────────────────────
    IF v_item_id LIKE 'shot-%' THEN
      -- Extract the UUID: second segment after first dash, before last dash+digits
      -- Format is "shot-<UUID>-<unix_ms>" — UUID is 36 chars
      -- Safer: take substring(v_item_id, 6, 36) because "shot-" is 5 chars
      v_uuid_str := substring(v_item_id FROM 6 FOR 36);

      BEGIN
        v_bottle_id := v_uuid_str::UUID;
      EXCEPTION WHEN others THEN
        CONTINUE; -- malformed id — skip silently
      END;

      -- Check current status
      SELECT status, owner_id INTO v_status, v_owner_id
        FROM public.opened_bottles
       WHERE id = v_bottle_id;

      IF NOT FOUND THEN CONTINUE; END IF;

      -- If marked finished, reopen it (also deletes bottle_finished wallet txs)
      IF v_status = 'finished' THEN
        UPDATE public.opened_bottles
           SET status = 'open', finished_at = NULL
         WHERE id = v_bottle_id;

        DELETE FROM public.wallet_transactions
         WHERE reference_id = v_bottle_id
           AND type = 'bottle_finished';
      END IF;

      -- Reverse the shot count and revenue (clamp at 0)
      UPDATE public.opened_bottles
         SET shots_sold = GREATEST(0, shots_sold - v_item_qty),
             revenue    = GREATEST(0, revenue    - v_revenue)
       WHERE id = v_bottle_id AND status = 'open';

    -- ── Pack item: id = "pack-{uuid}-{timestamp}" ──────────────────────────
    ELSIF v_item_id LIKE 'pack-%' THEN
      -- "pack-" is 5 chars, UUID is 36 chars
      v_uuid_str := substring(v_item_id FROM 6 FOR 36);

      BEGIN
        v_pack_id := v_uuid_str::UUID;
      EXCEPTION WHEN others THEN
        CONTINUE;
      END;

      -- Check current status
      SELECT status, owner_id INTO v_status, v_owner_id
        FROM public.opened_packs
       WHERE id = v_pack_id;

      IF NOT FOUND THEN CONTINUE; END IF;

      -- If marked finished, reopen it (also deletes pack_finished wallet txs)
      IF v_status = 'finished' THEN
        UPDATE public.opened_packs
           SET status = 'open', finished_at = NULL
         WHERE id = v_pack_id;

        DELETE FROM public.wallet_transactions
         WHERE reference_id = v_pack_id
           AND type = 'pack_finished';
      END IF;

      -- Reverse the unit count and revenue (clamp at 0)
      UPDATE public.opened_packs
         SET units_sold = GREATEST(0, units_sold - v_item_qty),
             revenue    = GREATEST(0, revenue    - v_revenue)
       WHERE id = v_pack_id AND status = 'open';

    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_order_shot_pack(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_order_shot_pack(JSONB) TO authenticated;
