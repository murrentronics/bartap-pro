-- Allow managers to insert, update, and delete products on behalf of their owner.
-- Managers have role='manager' or job_title='manager' and their parent owner's id
-- is returned by get_owner_id(auth.uid()).

-- ── INSERT ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Manager inserts products" ON public.products;
CREATE POLICY "Manager inserts products"
  ON public.products FOR INSERT
  WITH CHECK (
    owner_id = public.get_owner_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

-- ── UPDATE ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Manager updates products" ON public.products;
CREATE POLICY "Manager updates products"
  ON public.products FOR UPDATE
  USING (
    owner_id = public.get_owner_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );

-- ── DELETE ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Manager deletes products" ON public.products;
CREATE POLICY "Manager deletes products"
  ON public.products FOR DELETE
  USING (
    owner_id = public.get_owner_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'manager' OR job_title = 'manager')
    )
  );
