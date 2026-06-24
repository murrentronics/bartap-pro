-- Float sessions: owner sets a cash float for a machine.
-- Each row represents one session start; the "current session" is
-- the most recent row per machine.  Payouts recorded after set_at
-- count against that float until a new float is set.

CREATE TABLE IF NOT EXISTS public.machine_float_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id  UUID NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  set_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_float_sessions ENABLE ROW LEVEL SECURITY;

-- Owners can do everything on their own rows
CREATE POLICY "owner_all_float_sessions" ON public.machine_float_sessions
  FOR ALL USING (owner_id = auth.uid());

-- Cashiers can read float sessions for machines belonging to their employer
CREATE POLICY "cashier_read_float_sessions" ON public.machine_float_sessions
  FOR SELECT USING (
    owner_id IN (
      SELECT owner_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_float_sessions_machine_id
  ON public.machine_float_sessions (machine_id, set_at DESC);
