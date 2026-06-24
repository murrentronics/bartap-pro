-- ─────────────────────────────────────────────────────────────────────────────
-- Machines — gaming/vending machines tracker
-- machines        : one row per machine owned by an owner
-- machine_entries : payout or income entry per machine per day
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.machines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own machines"
  ON public.machines FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- machine_entries
--   type = 'payout'  → money paid OUT to players   (cost/expense)
--   type = 'income'  → cash taken OUT of machine   (revenue)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.machine_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id  UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('payout', 'income')),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note        TEXT,
  entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own machine entries"
  ON public.machine_entries FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.machines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_entries;
