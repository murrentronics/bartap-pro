-- ─────────────────────────────────────────────────────────────────────────────
-- Manager access to machines / machine_entries / machine_monitor /
-- machine_monitor_logs
--
-- Managers have role = 'manager' (or job_title = 'manager') and their
-- owner's id is stored in profiles.parent_id.
-- The existing cashier policies use the same parent_id pattern.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── machines: manager can SELECT / INSERT / UPDATE / DELETE ──────────────────
DROP POLICY IF EXISTS "manager_read_machines" ON public.machines;
CREATE POLICY "manager_read_machines"
  ON public.machines FOR SELECT
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_insert_machines" ON public.machines;
CREATE POLICY "manager_insert_machines"
  ON public.machines FOR INSERT
  WITH CHECK (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_update_machines" ON public.machines;
CREATE POLICY "manager_update_machines"
  ON public.machines FOR UPDATE
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_delete_machines" ON public.machines;
CREATE POLICY "manager_delete_machines"
  ON public.machines FOR DELETE
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

-- ── machine_entries: manager can SELECT / INSERT / UPDATE / DELETE ────────────
DROP POLICY IF EXISTS "manager_read_machine_entries" ON public.machine_entries;
CREATE POLICY "manager_read_machine_entries"
  ON public.machine_entries FOR SELECT
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_insert_machine_entries" ON public.machine_entries;
CREATE POLICY "manager_insert_machine_entries"
  ON public.machine_entries FOR INSERT
  WITH CHECK (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_update_machine_entries" ON public.machine_entries;
CREATE POLICY "manager_update_machine_entries"
  ON public.machine_entries FOR UPDATE
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_delete_machine_entries" ON public.machine_entries;
CREATE POLICY "manager_delete_machine_entries"
  ON public.machine_entries FOR DELETE
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

-- ── machine_monitor_logs: manager can SELECT / INSERT / UPDATE / DELETE ───────
-- Rows are stored with owner_id = the owner's UUID.
-- The manager reads/writes them on the owner's behalf.
DROP POLICY IF EXISTS "manager_read_machine_monitor_logs" ON public.machine_monitor_logs;
CREATE POLICY "manager_read_machine_monitor_logs"
  ON public.machine_monitor_logs FOR SELECT
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_insert_machine_monitor_logs" ON public.machine_monitor_logs;
CREATE POLICY "manager_insert_machine_monitor_logs"
  ON public.machine_monitor_logs FOR INSERT
  WITH CHECK (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_update_machine_monitor_logs" ON public.machine_monitor_logs;
CREATE POLICY "manager_update_machine_monitor_logs"
  ON public.machine_monitor_logs FOR UPDATE
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

DROP POLICY IF EXISTS "manager_delete_machine_monitor_logs" ON public.machine_monitor_logs;
CREATE POLICY "manager_delete_machine_monitor_logs"
  ON public.machine_monitor_logs FOR DELETE
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

-- ── machine_monitor: manager can SELECT / INSERT / UPDATE ────────────────────
-- This table holds the saved state of the Update-tab cards.
-- The unique key is (machine_id, owner_id); the row is upserted with
-- owner_id = the owner's UUID, so the manager must be allowed to read/write
-- that row too.
DO $$
BEGIN
  -- Only create policies if the table exists (it may have been created
  -- directly in the Supabase dashboard without a migration file).
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'machine_monitor'
  ) THEN
    DROP POLICY IF EXISTS "manager_read_machine_monitor" ON public.machine_monitor;
    EXECUTE $p$
      CREATE POLICY "manager_read_machine_monitor"
        ON public.machine_monitor FOR SELECT
        USING (
          owner_id IN (
            SELECT parent_id FROM public.profiles
            WHERE id = auth.uid()
              AND (role = 'manager' OR job_title = 'manager')
          )
        )
    $p$;

    DROP POLICY IF EXISTS "manager_insert_machine_monitor" ON public.machine_monitor;
    EXECUTE $p$
      CREATE POLICY "manager_insert_machine_monitor"
        ON public.machine_monitor FOR INSERT
        WITH CHECK (
          owner_id IN (
            SELECT parent_id FROM public.profiles
            WHERE id = auth.uid()
              AND (role = 'manager' OR job_title = 'manager')
          )
        )
    $p$;

    DROP POLICY IF EXISTS "manager_update_machine_monitor" ON public.machine_monitor;
    EXECUTE $p$
      CREATE POLICY "manager_update_machine_monitor"
        ON public.machine_monitor FOR UPDATE
        USING (
          owner_id IN (
            SELECT parent_id FROM public.profiles
            WHERE id = auth.uid()
              AND (role = 'manager' OR job_title = 'manager')
          )
        )
    $p$;
  END IF;
END $$;
