-- Add sort_order to machines for owner-controlled card arrangement.
-- Default 0 so existing rows sort by created_at (handled in app).

ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_machines_sort_order
  ON public.machines (owner_id, sort_order);
