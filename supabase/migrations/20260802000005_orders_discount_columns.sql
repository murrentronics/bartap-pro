-- Add discount_amount and original_total columns to orders table.
-- These were referenced in handle_order_insert() and the register.tsx insert
-- but the columns were never actually created in the schema.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount_amount  NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS original_total   NUMERIC(10,2) DEFAULT NULL;
