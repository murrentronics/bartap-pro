-- Per-user machine sort order (same pattern as bar_sort_order)
-- Each user (owner or cashier) stores their own machine display order independently

CREATE TABLE IF NOT EXISTS public.machine_sort_order (
  owner_id   UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_json JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_sort_order ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "machine_sort_own" ON public.machine_sort_order;

CREATE POLICY "machine_sort_own"
  ON public.machine_sort_order
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
