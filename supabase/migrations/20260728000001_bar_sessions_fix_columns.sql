-- Ensure bar_sessions uses opened_at/closed_at column names (rename if still old names exist).
-- Safe to run multiple times — uses IF EXISTS guards.

DO $$
BEGIN
  -- Rename session_start → opened_at if the old name still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bar_sessions' AND column_name = 'session_start'
  ) THEN
    ALTER TABLE public.bar_sessions RENAME COLUMN session_start TO opened_at;
  END IF;

  -- Rename session_end → closed_at if the old name still exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bar_sessions' AND column_name = 'session_end'
  ) THEN
    ALTER TABLE public.bar_sessions RENAME COLUMN session_end TO closed_at;
  END IF;
END $$;

-- Ensure opened_at has a default of now() so old inserts without it still work
ALTER TABLE public.bar_sessions
  ALTER COLUMN opened_at SET DEFAULT now();

-- Index for fast lookup by opened_at date (used by Summary page session accordions)
CREATE INDEX IF NOT EXISTS idx_bar_sessions_opened_at ON public.bar_sessions(owner_id, opened_at DESC);
