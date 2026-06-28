-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: wallet_balance not decreasing when an order is deleted.
--
-- Root cause: the app deletes wallet_transactions (order_id match) BEFORE
-- deleting the order row. The trigger fires on order DELETE and uses OLD.total
-- directly — this should work, BUT GREATEST(0, ...) was clamping incorrectly
-- in edge cases. We rebuild the trigger without the clamp so the balance
-- can go negative if somehow the cashier was over-cleared, then we also
-- store the last_delete timestamp in the same table used by the UI.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_order_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Deduct the exact order total from the cashier wallet.
  -- Allow negative (don't clamp) so the balance always mirrors reality.
  UPDATE public.profiles
     SET wallet_balance = wallet_balance - OLD.total
   WHERE id = OLD.cashier_id;

  RETURN OLD;
END;
$$;

-- Recreate the trigger (idempotent)
DROP TRIGGER IF EXISTS on_order_delete ON public.orders;
CREATE TRIGGER on_order_delete
  AFTER DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_delete();

-- ── cashier_last_delete table (created by 20260628000001, but recreate safely) ──
CREATE TABLE IF NOT EXISTS public.cashier_last_delete (
  cashier_id   UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cashier_last_delete ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cashier_last_delete_select" ON public.cashier_last_delete;
DROP POLICY IF EXISTS "cashier_last_delete_upsert" ON public.cashier_last_delete;

CREATE POLICY "cashier_last_delete_select" ON public.cashier_last_delete
  FOR SELECT USING (cashier_id = auth.uid());

CREATE POLICY "cashier_last_delete_upsert" ON public.cashier_last_delete
  FOR ALL USING (cashier_id = auth.uid())
  WITH CHECK (cashier_id = auth.uid());

-- Allow owners to upsert their own row too (owner can delete their own direct sales)
CREATE POLICY "owner_last_delete_upsert" ON public.cashier_last_delete
  FOR ALL USING (
    cashier_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  )
  WITH CHECK (
    cashier_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'owner'
    )
  );
