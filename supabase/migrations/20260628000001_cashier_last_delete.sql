-- Store the timestamp of the last deleted order per cashier.
-- Used to prevent the delete button from reappearing on older sales after a refresh.

CREATE TABLE IF NOT EXISTS public.cashier_last_delete (
  cashier_id   UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cashier_last_delete ENABLE ROW LEVEL SECURITY;

-- Cashier can read and upsert their own row
CREATE POLICY "cashier_last_delete_select" ON public.cashier_last_delete
  FOR SELECT USING (cashier_id = auth.uid());

CREATE POLICY "cashier_last_delete_upsert" ON public.cashier_last_delete
  FOR ALL USING (cashier_id = auth.uid())
  WITH CHECK (cashier_id = auth.uid());
