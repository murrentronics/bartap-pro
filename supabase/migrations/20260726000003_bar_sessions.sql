-- bar_sessions table already existed with session_start/session_end columns.
-- Rename to opened_at/closed_at to match app code, add RLS and indexes.

ALTER TABLE public.bar_sessions
  RENAME COLUMN session_start TO opened_at;

ALTER TABLE public.bar_sessions
  RENAME COLUMN session_end TO closed_at;

ALTER TABLE public.bar_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own bar sessions" ON public.bar_sessions;
CREATE POLICY "View own bar sessions"
  ON public.bar_sessions FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));

DROP POLICY IF EXISTS "Insert bar sessions" ON public.bar_sessions;
CREATE POLICY "Insert bar sessions"
  ON public.bar_sessions FOR INSERT
  WITH CHECK (owner_id = public.get_owner_id(auth.uid()));

DROP POLICY IF EXISTS "Update bar sessions" ON public.bar_sessions;
CREATE POLICY "Update bar sessions"
  ON public.bar_sessions FOR UPDATE
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_bar_sessions_owner ON public.bar_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_bar_sessions_opened ON public.bar_sessions(owner_id, opened_at DESC);
