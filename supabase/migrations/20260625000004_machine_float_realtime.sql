-- Enable realtime for machine_float_sessions so the machines page hero
-- updates live when a float is set/changed.
ALTER TABLE public.machine_float_sessions REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.machine_float_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- machine_entries and machines were added to supabase_realtime in
-- 20260621000001_machines.sql but REPLICA IDENTITY was never set.
-- Without FULL identity, column-level filters (owner_id=eq.X, machine_id=eq.X)
-- silently receive nothing on INSERT — so all machine hero cards stay stale.
ALTER TABLE public.machine_entries REPLICA IDENTITY FULL;
ALTER TABLE public.machines        REPLICA IDENTITY FULL;
