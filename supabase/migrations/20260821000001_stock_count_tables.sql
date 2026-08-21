-- Create stock_count_tables for persistent stock count sheets across devices.
-- Each row is one table created by a user (owner/manager/cashier).
-- Tables and rows are stored as JSON arrays so the schema stays flexible.

CREATE TABLE IF NOT EXISTS public.stock_count_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_count_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD their own stock count tables"
ON public.stock_count_tables
FOR ALL
USING (auth.uid() = profile_id)
WITH CHECK (auth.uid() = profile_id);

CREATE INDEX IF NOT EXISTS idx_stock_count_tables_profile
ON public.stock_count_tables(profile_id);

CREATE INDEX IF NOT EXISTS idx_stock_count_tables_owner
ON public.stock_count_tables(owner_id);
