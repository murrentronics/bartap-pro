-- Final definitive handle_order_insert:
-- • Cashier/manager gets wallet_balance credit and 'sale' tx with order number
-- • Owner gets a READ-ONLY 'cashier_sale' tx ONLY for cashier (non-manager) sales
-- • Manager sales do NOT add to owner wallet_balance or create cashier_sale tx
-- • Chain master acting as bar owner routes credit to the bar's wallet

CREATE OR REPLACE FUNCTION public.handle_order_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cashier_username TEXT;
  v_items_text       TEXT;
  v_discount_text    TEXT := '';
  v_is_manager       BOOLEAN;
  v_is_chain_master  BOOLEAN;
  v_order_label      TEXT;
BEGIN
  v_order_label := 'Order #' || COALESCE(NEW.order_number::text, substr(NEW.id::text, 1, 8));

  -- Detect chain master acting as bar (cashier_id = master, owner_id = bar account)
  SELECT (parent_id = NEW.cashier_id AND is_bar_account = true)
    INTO v_is_chain_master
    FROM public.profiles
   WHERE id = NEW.owner_id;

  IF COALESCE(v_is_chain_master, false) THEN
    -- Chain master acting as bar — credit the BAR's wallet
    UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.owner_id;
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
      VALUES (NEW.owner_id, NEW.total, 'sale', v_order_label, NEW.id);
    RETURN NEW;
  END IF;

  -- Check if cashier is a manager
  SELECT (role = 'manager' OR job_title = 'manager')
    INTO v_is_manager
    FROM public.profiles WHERE id = NEW.cashier_id;

  -- Credit the cashier/manager wallet
  UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.cashier_id;
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (NEW.cashier_id, NEW.total, 'sale', v_order_label, NEW.id);

  -- Only write a cashier_sale record to the owner's feed for real cashiers (NOT managers, NOT owner)
  IF NOT COALESCE(v_is_manager, false) AND NEW.cashier_id IS DISTINCT FROM NEW.owner_id THEN
    SELECT username INTO v_cashier_username
      FROM public.profiles WHERE id = NEW.cashier_id;

    SELECT string_agg(
      (item->>'qty') || 'x ' || (item->>'name'), ', '
    )
    INTO v_items_text
    FROM jsonb_array_elements(NEW.items::jsonb) AS item;

    IF NEW.discount_amount IS NOT NULL AND NEW.discount_amount > 0 THEN
      v_discount_text := ' | Disc: -$' || NEW.discount_amount::text
                      || ' (orig $'    || COALESCE(NEW.original_total::text,
                                                   (NEW.total + NEW.discount_amount)::text) || ')';
    END IF;

    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (
      NEW.owner_id,
      NEW.total,
      'cashier_sale',
      'Cashier: ' || COALESCE(v_cashier_username, 'Unknown')
        || ' | Total: $'  || NEW.total::text
        || ' · Paid: $'   || COALESCE(NEW.paid::text, NEW.total::text)
        || ' · Change: $' || COALESCE(NEW.change_given::text, '0')
        || v_discount_text
        || ' | ' || COALESCE(v_items_text, ''),
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_insert ON public.orders;
CREATE TRIGGER on_order_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_insert();
