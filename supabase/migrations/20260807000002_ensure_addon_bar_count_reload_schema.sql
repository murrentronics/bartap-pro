-- Ensure addon_bar_count and is_multi_bar exist on profiles
-- (guards against schema cache drift) and force PostgREST to reload.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS addon_bar_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_multi_bar boolean NOT NULL DEFAULT false;

-- Force PostgREST to reload its schema cache so these columns are visible
NOTIFY pgrst, 'reload schema';
