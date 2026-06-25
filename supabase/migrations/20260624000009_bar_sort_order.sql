-- Bar page sort order — separate from products.sort_order (used by items/management page).
-- Stores the owner's preferred display order on the POS/register screen.
-- One row per owner, JSONB array of product IDs in display order.
-- Cashiers inherit their owner's sort order (looked up via parent_id).

CREATE TABLE IF NOT EXISTS public.bar_sort_order (
  owner_id   UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bar_sort_order ENABLE ROW LEVEL SECURITY;

-- Owners can read/write their own row
CREATE POLICY "owner_manage_bar_sort"
  ON public.bar_sort_order FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Cashiers can read their employer's row
CREATE POLICY "cashier_read_bar_sort"
  ON public.bar_sort_order FOR SELECT
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );
