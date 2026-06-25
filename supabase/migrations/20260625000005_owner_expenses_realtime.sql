-- owner_expenses and owner_financials are queried by the wallet hero cards.
-- Without REPLICA IDENTITY FULL, a filtered realtime subscription on these
-- tables can silently break the entire channel they share — taking down
-- the opened_bottles and other subscriptions on the same channel object.
ALTER TABLE public.owner_expenses    REPLICA IDENTITY FULL;
ALTER TABLE public.owner_financials  REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.owner_expenses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.owner_financials;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
