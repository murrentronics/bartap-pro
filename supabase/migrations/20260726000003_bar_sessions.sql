-- Track bar session open/close history so the machines summary can show per-session stats
CREATE TABLE IF NOT EXISTS public.bar_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bar_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own bar sessions"
  ON public.bar_sessions FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Insert bar sessions"
  ON public.bar_sessions FOR INSERT
  WITH CHECK (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Update bar sessions"
  ON public.bar_sessions FOR UPDATE
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_bar_sessions_owner ON public.bar_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_bar_sessions_opened ON public.bar_sessions(owner_id, opened_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bar_sessions;
