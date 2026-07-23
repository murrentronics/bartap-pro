-- ─── Add manager and custom to app_role enum ─────────────────────────────────
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'custom';

-- ─── Add job_title column (used by Custom workers to label their role) ─────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS job_title TEXT;

-- ─── Add has_login column (false for Custom no-login workers) ─────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_login BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── RLS: Allow owner to insert/delete custom worker profile rows ─────────────
DROP POLICY IF EXISTS "Owner can insert custom worker profiles" ON public.profiles;
CREATE POLICY "Owner can insert custom worker profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (
    parent_id IS NOT NULL
    AND parent_id = auth.uid()
    AND has_login = FALSE
  );

DROP POLICY IF EXISTS "Owner can delete custom worker profiles" ON public.profiles;
CREATE POLICY "Owner can delete custom worker profiles"
  ON public.profiles FOR DELETE
  USING (
    parent_id IS NOT NULL
    AND parent_id = auth.uid()
    AND has_login = FALSE
  );
