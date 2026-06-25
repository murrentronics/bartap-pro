-- Fix cashier_sale wallet transaction:
-- 1. Show the actual amount (not 0) so the green $ shows on owner's feed
-- 2. Add Total/Paid/Change to the note so the wallet page renders them correctly

CREATE OR REPLACE FUNCTION public.handle_order_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cashier_username TEXT;
  v_items_text       TEXT;
BEGIN
  -- 1. Credit the cashier's wallet
  UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.cashier_id;
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (NEW.cashier_id, NEW.total, 'sale', 'Order sale', NEW.id);

  -- 2. Write a record to the owner's feed when a cashier placed the order
  IF NEW.cashier_id IS DISTINCT FROM NEW.owner_id THEN
    SELECT username INTO v_cashier_username
      FROM public.profiles WHERE id = NEW.cashier_id;

    SELECT string_agg(
      (item->>'qty') || 'x ' || (item->>'name'),
      ', '
    )
    INTO v_items_text
    FROM jsonb_array_elements(NEW.items::jsonb) AS item;

    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (
      NEW.owner_id,
      NEW.total,
      'cashier_sale',
      'Cashier: ' || COALESCE(v_cashier_username, 'Unknown')
        || ' | Total: $' || NEW.total::text
            || ' · Paid: $'   || COALESCE(NEW.paid::text, NEW.total::text)
            || ' · Change: $' || COALESCE(NEW.change_given::text, '0')
        || ' | ' || COALESCE(v_items_text, ''),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;
