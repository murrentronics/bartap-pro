-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 1: Zero out any existing negative wallet balances for cashiers/managers.
--         These were caused by the old onClear() code that deleted all orders
--         for a cashier after clearing — triggering the on_order_delete trigger
--         which subtracted each order total from wallet_balance, making it negative.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.profiles
SET wallet_balance = 0
WHERE wallet_balance < 0
  AND role IN ('cashier', 'manager');

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix 2: Rebuild on_order_delete trigger so it NEVER deducts from wallet_balance.
--
--         The wallet_balance is managed atomically by:
--           - handle_order_insert (adds total on insert)
--           - transfer_cashier_to_owner / transfer_manager_to_owner (zeroes on clear)
--           - wallet_transactions rows (the source of truth for balance)
--
--         Deleting an order should only cascade-delete the linked wallet_transactions
--         (handled by the FK ON DELETE CASCADE added in migration 20260628000005).
--         It must NOT touch wallet_balance directly — that's already handled by
--         the wallet_transactions cascade + the transfer RPCs.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Intentionally does nothing to wallet_balance.
  -- wallet_transactions rows are removed by ON DELETE CASCADE (FK constraint).
  -- wallet_balance is computed from wallet_transactions by the app layer,
  -- or zeroed explicitly by transfer_cashier_to_owner / transfer_manager_to_owner.
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_order_delete ON public.orders;
CREATE TRIGGER on_order_delete
  AFTER DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_delete();
