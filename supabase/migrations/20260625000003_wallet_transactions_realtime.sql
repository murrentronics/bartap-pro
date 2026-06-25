-- Enable realtime for wallet_transactions and orders tables
-- Without this, Supabase Realtime never broadcasts changes and the
-- wallet transactions tab never updates automatically.

ALTER TABLE public.wallet_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.orders REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_transactions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
