-- ─────────────────────────────────────────────────────────────────────────────
-- Root cause fix: wallet_transactions.order_id was ON DELETE SET NULL.
-- When an order is deleted, Postgres set order_id = NULL BEFORE the trigger
-- fired, so DELETE FROM wallet_transactions WHERE order_id = OLD.id found
-- nothing — both the cashier 'sale' row and the owner 'cashier_sale' row survived.
--
-- Fix: change to ON DELETE CASCADE so all linked wallet_transactions rows
-- are automatically deleted when their order is deleted.
-- The handle_order_delete trigger then only needs to handle wallet_balance.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old SET NULL constraint and replace with CASCADE
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_order_id_fkey;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_order_id_fkey
  FOREIGN KEY (order_id)
  REFERENCES public.orders(id)
  ON DELETE CASCADE;

-- ── Rebuild the trigger — now only handles wallet_balance deduction ───────────
-- (wallet_transactions cleanup is handled by the CASCADE above)
CREATE OR REPLACE FUNCTION public.handle_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deduct the order total from the cashier's wallet balance
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
