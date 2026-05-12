-- Enable realtime publication for the products table
-- NOTE: Already included in combined_setup.sql for fresh deploys.
-- This migration exists for databases created before realtime was enabled on products.
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
