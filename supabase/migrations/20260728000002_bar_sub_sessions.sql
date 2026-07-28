-- bar_sub_sessions: tracks cashier shifts within a bar session.
-- A sub-session starts when the bar opens (first sub) or when "Update Float / New Session" is clicked.
-- It ends when another sub-session begins or when the bar closes.

CREATE TABLE IF NOT EXISTS public.bar_sub_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bar_session_id UUID NOT NULL REFERENCES public.bar_sessions(id) ON DELETE CASCADE,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  cashier_float NUMERIC(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE public.bar_sub_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own bar sub sessions" ON public.bar_sub_sessions;
CREATE POLICY "View own bar sub sessions"
  ON public.bar_sub_sessions FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));

DROP POLICY IF EXISTS "Insert bar sub sessions" ON public.bar_sub_sessions;
CREATE POLICY "Insert bar sub sessions"
  ON public.bar_sub_sessions FOR INSERT
  WITH CHECK (owner_id = public.get_owner_id(auth.uid()));

DROP POLICY IF EXISTS "Update bar sub sessions" ON public.bar_sub_sessions;
CREATE POLICY "Update bar sub sessions"
  ON public.bar_sub_sessions FOR UPDATE
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_bar_sub_sessions_owner ON public.bar_sub_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_bar_sub_sessions_bar_session ON public.bar_sub_sessions(bar_session_id);
CREATE INDEX IF NOT EXISTS idx_bar_sub_sessions_opened ON public.bar_sub_sessions(owner_id, opened_at DESC);
