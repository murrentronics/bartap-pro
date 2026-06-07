-- Fix cashier delete: orders.cashier_id is NOT NULL but the FK is ON DELETE SET NULL
-- These two are contradictory — Postgres tries to SET NULL but the column rejects it.
-- Solution: make cashier_id nullable so deleting a cashier preserves their order history.

ALTER TABLE public.orders
  ALTER COLUMN cashier_id DROP NOT NULL;
