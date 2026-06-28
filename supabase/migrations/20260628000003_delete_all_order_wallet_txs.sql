-- ─────────────────────────────────────────────────────────────────────────────
-- When an order is deleted, remove ALL wallet_transactions linked to it
-- (both the cashier's 'sale' row AND the owner's 'cashier_sale' row).
-- This runs SECURITY DEFINER so it bypasses RLS — the cashier's client-side
-- delete only reaches rows they own, so the owner's record was surviving.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Remove every wallet_transaction tied to this order (cashier + owner rows)
  DELETE FROM public.wallet_transactions WHERE order_id = OLD.id;

  -- 2. Deduct the exact order total from the cashier's wallet balance
  UPDATE public.profiles
     SET wallet_balance = wallet_balance - OLD.total
   WHERE id = OLD.cashier_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_order_delete ON public.orders;
CREATE TRIGGER on_order_delete
  AFTER DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_delete();
