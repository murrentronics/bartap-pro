-- Fix: machine_entries was ON DELETE CASCADE so deleting a machine card always
-- wiped all its entries regardless of what the owner chose in the UI.
-- Change to ON DELETE SET NULL so "Remove Card Only" keeps the history intact.
-- The app code already handles explicit deletion when owner picks "Delete Everything".

-- 1. Drop NOT NULL on machine_id so SET NULL is allowed
ALTER TABLE public.machine_entries
  ALTER COLUMN machine_id DROP NOT NULL;

-- 2. Swap the FK from CASCADE to SET NULL
ALTER TABLE public.machine_entries
  DROP CONSTRAINT IF EXISTS machine_entries_machine_id_fkey;

ALTER TABLE public.machine_entries
  ADD CONSTRAINT machine_entries_machine_id_fkey
    FOREIGN KEY (machine_id)
    REFERENCES public.machines(id)
    ON DELETE SET NULL;
