-- Add stock_qty column to products table
-- NOTE: Already included in combined_setup.sql for fresh deploys.
-- This migration exists for databases created before stock_qty was added.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_qty INTEGER NOT NULL DEFAULT 0;
