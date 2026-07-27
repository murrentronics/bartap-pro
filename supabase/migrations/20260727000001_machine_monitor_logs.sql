-- ─────────────────────────────────────────────────────────────────────────────
-- machine_monitor_logs — safe re-run version
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.machine_monitor_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id   UUID        NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  owner_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  in_present   NUMERIC(12,2) NOT NULL DEFAULT 0,
  out_present  NUMERIC(12,2) NOT NULL DEFAULT 0,
  in_last      NUMERIC(12,2) NOT NULL DEFAULT 0,
  out_last     NUMERIC(12,2) NOT NULL DEFAULT 0,
  in_diff      NUMERIC(12,2) NOT NULL DEFAULT 0,
  out_diff     NUMERIC(12,2) NOT NULL DEFAULT 0,
  seq          BIGINT      NOT NULL DEFAULT 0,
  logged_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_monitor_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'machine_monitor_logs'
    AND policyname = 'Owner manages own monitor logs'
  ) THEN
    CREATE POLICY "Owner manages own monitor logs"
      ON public.machine_monitor_logs FOR ALL
      USING  (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS machine_monitor_logs_machine_seq
  ON public.machine_monitor_logs (machine_id, seq ASC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'machine_monitor_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_monitor_logs;
  END IF;
END $$;
