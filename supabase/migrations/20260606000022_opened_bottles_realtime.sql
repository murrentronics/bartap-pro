-- Enable full replica identity on opened_bottles so Supabase Realtime
-- broadcasts UPDATE events with the new row data (shots_sold, revenue).
-- Without this, UPDATE events either don't fire or arrive with null new values.
ALTER TABLE public.opened_bottles REPLICA IDENTITY FULL;

-- Add the table to the supabase_realtime publication so changes are broadcast
ALTER PUBLICATION supabase_realtime ADD TABLE public.opened_bottles;
