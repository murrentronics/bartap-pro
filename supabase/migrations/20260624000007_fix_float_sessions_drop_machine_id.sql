-- The original machine_float_sessions table was created with a machine_id NOT NULL column.
-- The redesign made float owner-level (one float covers all machines), so machine_id is obsolete.
-- Drop it if it still exists.

ALTER TABLE public.machine_float_sessions
  DROP COLUMN IF EXISTS machine_id;
