-- When a cashier places an order, insert a read-only record into the owner's
-- wallet_transactions so the owner can see all cashier activity in one place.
-- amount = 0 so the owner's balance is never affected (same as bottle_finished).
-- note format: "Cashier: {cashier_username} | ${total} | items…"

CREATE OR REPLACE FUNCTION public.handle_order_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cashier_username TEXT;
  v_items_text       TEXT;
BEGIN
  -- 1. Credit the cashier's wallet (unchanged)
  UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.cashier_id;
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (NEW.cashier_id, NEW.total, 'sale', 'Order sale', NEW.id);

  -- 2. If a cashier placed the order (cashier_id ≠ owner_id), write a read-only
  --    record to the owner's wallet so they can see all activity in one feed.
  IF NEW.cashier_id IS DISTINCT FROM NEW.owner_id THEN
    SELECT username INTO v_cashier_username
      FROM public.profiles WHERE id = NEW.cashier_id;

    -- Build a compact items string from the JSONB array
    SELECT string_agg(
      (item->>'qty') || 'x ' || (item->>'name'),
      ', '
    )
    INTO v_items_text
    FROM jsonb_array_elements(NEW.items::jsonb) AS item;

    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (
      NEW.owner_id,
      0,
      'cashier_sale',
      'Cashier: ' || COALESCE(v_cashier_username, 'Unknown')
        || ' | $' || NEW.total::text
        || ' | ' || COALESCE(v_items_text, ''),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;
