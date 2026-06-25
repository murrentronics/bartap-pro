-- Cashiers need to read their employer's machines and read/write machine_entries.
-- The owner_id on every row is the OWNER's UUID, but the cashier's auth.uid()
-- is their own UUID, so the existing "owner_id = auth.uid()" policy blocks them.

-- ── machines: cashiers can SELECT their employer's machines ──────────────────
CREATE POLICY "cashier_read_machines"
  ON public.machines FOR SELECT
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );

-- ── machine_entries: cashiers can SELECT and INSERT for their employer ────────
CREATE POLICY "cashier_read_machine_entries"
  ON public.machine_entries FOR SELECT
  USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );

CREATE POLICY "cashier_insert_machine_entries"
  ON public.machine_entries FOR INSERT
  WITH CHECK (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );
