-- ─────────────────────────────────────────────────────────────────────────────
-- Cleanup orphaned machine_monitor and machine_monitor_logs rows
--
-- After a factory reset, machines rows are deleted but machine_monitor /
-- machine_monitor_logs were not cleared, leaving stale rows whose machine_id
-- references no longer exist. This migration removes those orphans for all
-- owners, which also fixes Renard's account specifically.
-- ─────────────────────────────────────────────────────────────────────────────

-- Remove machine_monitor_logs rows where the machine no longer exists
DELETE FROM public.machine_monitor_logs
WHERE machine_id NOT IN (SELECT id FROM public.machines);

-- Remove machine_monitor rows where the machine no longer exists
-- (machine_monitor keyed on machine_id + owner_id)
DELETE FROM public.machine_monitor
WHERE machine_id NOT IN (SELECT id FROM public.machines);
