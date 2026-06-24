-- Float sessions: owner sets a single cash float for ALL their machines combined.
-- One float covers the whole floor. Payouts from any machine draw from this float.
-- Each row = one session start. Current session = most recent row for this owner.

CREATE TABLE IF NOT EXISTS public.machine_float_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  set_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_float_sessions ENABLE ROW LEVEL SECURITY;

-- Owners can do everything on their own rows
CREATE POLICY "owner_all_float_sessions" ON public.machine_float_sessions
  FOR ALL USING (owner_id = auth.uid());

-- Cashiers can read float sessions belonging to their employer
CREATE POLICY "cashier_read_float_sessions" ON public.machine_float_sessions
  FOR SELECT USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles WHERE id = auth.uid() AND role = 'cashier'
    )
  );

CREATE INDEX IF NOT EXISTS idx_float_sessions_owner_id
  ON public.machine_float_sessions (owner_id, set_at DESC);
