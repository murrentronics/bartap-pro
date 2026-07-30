 -- ── machine_monitor_logs: add chain owner RLS policy ─────────────────────────
-- machine_entries and machines already have chain policies from 20260708000002
-- but machine_monitor_logs was never given one, so chain owners see empty logs
-- when viewing sub-bar accounts.

CREATE POLICY "Chain owner manages bar monitor logs"
  ON public.machine_monitor_logs FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));
