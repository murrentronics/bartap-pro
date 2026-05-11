-- Trigger: after each order insert, if owner has more than 1000 orders,
-- delete the oldest ones to keep the count at 1000.
CREATE OR REPLACE FUNCTION public.cap_orders_per_owner()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _count INT;
BEGIN
  SELECT COUNT(*) INTO _count FROM public.orders WHERE owner_id = NEW.owner_id;

  IF _count > 1000 THEN
    DELETE FROM public.orders
    WHERE id IN (
      SELECT id FROM public.orders
      WHERE owner_id = NEW.owner_id
      ORDER BY created_at ASC
      LIMIT (_count - 1000)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_cap ON public.orders;
CREATE TRIGGER on_order_cap
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.cap_orders_per_owner();
