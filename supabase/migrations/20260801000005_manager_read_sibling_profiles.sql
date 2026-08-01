-- Allow managers to read sibling staff profiles (same parent owner).
-- Uses a SECURITY DEFINER function to avoid infinite recursion in the policy.

-- Helper: returns the parent_id of the calling manager (bypasses RLS, no recursion)
CREATE OR REPLACE FUNCTION public.get_manager_parent_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT parent_id FROM public.profiles
  WHERE id = auth.uid()
    AND (role = 'manager' OR job_title = 'manager')
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "Manager reads sibling profiles" ON public.profiles;
CREATE POLICY "Manager reads sibling profiles"
  ON public.profiles FOR SELECT
  USING (
    -- Always allow reading own profile
    id = auth.uid()
    OR
    -- Allow reading sibling profiles via the non-recursive helper
    (
      parent_id IS NOT NULL
      AND parent_id = public.get_manager_parent_id()
    )
  );
