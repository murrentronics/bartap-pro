-- Add order_number to orders and daily counter to profiles
-- This gives each order a running number per owner, resetting daily

-- 1. Add order_number to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number INTEGER;

-- 2. Add daily counter to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_order_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_order_date DATE;

-- 3. Function to get next order number for an owner
CREATE OR REPLACE FUNCTION public.get_next_order_number(_owner_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _today DATE := CURRENT_DATE;
  _current_count INTEGER;
  _current_date DATE;
  _next_num INTEGER;
BEGIN
  -- Lock the profile row to prevent race conditions
  SELECT daily_order_count, last_order_date
    INTO _current_count, _current_date
    FROM public.profiles
   WHERE id = _owner_id
   FOR UPDATE;

  IF _current_date IS NULL OR _current_date != _today THEN
    _next_num := 1;
  ELSE
    _next_num := COALESCE(_current_count, 0) + 1;
  END IF;

  UPDATE public.profiles
     SET daily_order_count = _next_num,
         last_order_date = _today
   WHERE id = _owner_id;

  RETURN _next_num;
END;
$$;

-- 4. Update the order insert trigger to set order_number
CREATE OR REPLACE FUNCTION public.handle_order_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _order_num INTEGER;
BEGIN
  -- Only set order_number if not already provided (e.g. from frontend RPC)
  IF NEW.order_number IS NULL THEN
    _order_num := public.get_next_order_number(NEW.owner_id);
    NEW.order_number := _order_num;
  END IF;

  -- Update cashier wallet balance
  UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.cashier_id;

  -- Record cashier sale
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (NEW.cashier_id, NEW.total, 'sale', 'Order #' || NEW.order_number, NEW.id);

  -- Record owner copy
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (NEW.owner_id, NEW.total, 'cashier_sale', 'Order #' || NEW.order_number, NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_insert ON public.orders;
CREATE TRIGGER on_order_insert BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_insert();

GRANT EXECUTE ON FUNCTION public.get_next_order_number(UUID) TO authenticated;
