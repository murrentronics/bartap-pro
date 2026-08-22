-- Fix order_number assignment
-- Previously the trigger ran AFTER INSERT and did a separate UPDATE,
-- so .select("order_number") on the insert always returned NULL.
-- Changed to BEFORE INSERT so order_number is set on the row itself.

-- Keep the wallet/cashier logic in a separate AFTER INSERT trigger.

-- 1. BEFORE INSERT: assign order_number directly on NEW
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := public.get_next_order_number(NEW.owner_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_order_insert ON public.orders;
CREATE TRIGGER before_order_insert
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- 2. AFTER INSERT: handle wallet transactions only (no more UPDATE for order_number)
CREATE OR REPLACE FUNCTION public.handle_order_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_manager BOOLEAN;
BEGIN
  -- Check if cashier is a manager
  SELECT (role = 'manager' OR job_title = 'manager') INTO _is_manager
    FROM public.profiles WHERE id = NEW.cashier_id;

  -- Update cashier/manager wallet balance
  UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.cashier_id;

  -- Record cashier/manager sale transaction
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (NEW.cashier_id, NEW.total, 'sale', 'Order #' || COALESCE(NEW.order_number::text, substr(NEW.id::text, 1, 8)), NEW.id);

  -- Only record owner copy for cashiers who are NOT the owner themselves
  IF NOT _is_manager AND NEW.cashier_id <> NEW.owner_id THEN
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
      VALUES (NEW.owner_id, NEW.total, 'cashier_sale', 'Order #' || COALESCE(NEW.order_number::text, substr(NEW.id::text, 1, 8)), NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_insert ON public.orders;
CREATE TRIGGER on_order_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_insert();

GRANT EXECUTE ON FUNCTION public.set_order_number() TO authenticated;
