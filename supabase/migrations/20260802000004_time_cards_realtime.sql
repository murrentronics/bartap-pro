-- Enable Supabase Realtime for time_cards so clock-in/clock-out events
-- are broadcast immediately to all subscribed clients (owner + manager).
-- Without this the postgres_changes subscription in the UI receives nothing.

-- REPLICA IDENTITY FULL lets Realtime include all column values in the
-- change payload (needed for UPDATE/DELETE events to carry the full row).
ALTER TABLE public.time_cards REPLICA IDENTITY FULL;

-- Add the table to the supabase_realtime publication so the replication
-- slot actually captures its WAL events.
ALTER PUBLICATION supabase_realtime ADD TABLE public.time_cards;
