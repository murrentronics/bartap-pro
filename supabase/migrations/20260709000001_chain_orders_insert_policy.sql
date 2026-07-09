-- ─────────────────────────────────────────────────────────────────────────────
-- Chain owner support: allow a chain owner (auth.uid() = master)
-- to insert/update data scoped to any of their bar sub-accounts.
--
-- The existing policies use:
--   owner_id = auth.uid()          ← blocks bar sub-account IDs
--   cashier_id = auth.uid()        ← blocks bar sub-account IDs
--   get_owner_id(auth.uid())       ← returns master ID, not bar ID
--
-- Fix: add a helper that returns true when the given owner_id is either
-- the caller themselves OR a bar sub-account that belongs to them.
-- Then add permissive policies for each affected table.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: is _owner_id "in scope" for the calling user?
-- True if: caller IS the owner, OR caller is a chain master and _owner_id is one of their bars.
CREATE OR REPLACE FUNCTION public.is_owner_in_scope(_owner_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _owner_id
      AND (
        id = auth.uid()                          -- regular owner acting as themselves
        OR parent_id = auth.uid()                -- chain master acting as a bar sub-account
      )
  );
$$;

-- ── orders ───────────────────────────────────────────────────────────────────
-- Allow chain owner to insert orders where owner_id is one of their bars
-- and cashier_id is also that bar (owner ringing their own sale)
DROP POLICY IF EXISTS "Chain owner inserts orders" ON public.orders;
CREATE POLICY "Chain owner inserts orders"
  ON public.orders FOR INSERT
  WITH CHECK (public.is_owner_in_scope(owner_id) AND public.is_owner_in_scope(cashier_id));

DROP POLICY IF EXISTS "Chain owner selects orders" ON public.orders;
CREATE POLICY "Chain owner selects orders"
  ON public.orders FOR SELECT
  USING (public.is_owner_in_scope(owner_id));

DROP POLICY IF EXISTS "Chain owner deletes orders" ON public.orders;
CREATE POLICY "Chain owner deletes orders"
  ON public.orders FOR DELETE
  USING (public.is_owner_in_scope(owner_id));

-- ── products ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner inserts products" ON public.products;
CREATE POLICY "Chain owner inserts products"
  ON public.products FOR INSERT
  WITH CHECK (public.is_owner_in_scope(owner_id));

DROP POLICY IF EXISTS "Chain owner updates products" ON public.products;
CREATE POLICY "Chain owner updates products"
  ON public.products FOR UPDATE
  USING (public.is_owner_in_scope(owner_id));

DROP POLICY IF EXISTS "Chain owner deletes products" ON public.products;
CREATE POLICY "Chain owner deletes products"
  ON public.products FOR DELETE
  USING (public.is_owner_in_scope(owner_id));

DROP POLICY IF EXISTS "Chain owner selects products" ON public.products;
CREATE POLICY "Chain owner selects products"
  ON public.products FOR SELECT
  USING (public.is_owner_in_scope(owner_id));

-- ── credit_accounts ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages credit accounts" ON public.credit_accounts;
CREATE POLICY "Chain owner manages credit accounts"
  ON public.credit_accounts FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── credit_transactions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages credit transactions" ON public.credit_transactions;
CREATE POLICY "Chain owner manages credit transactions"
  ON public.credit_transactions FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── wallet_transactions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner views wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Chain owner views wallet transactions"
  ON public.wallet_transactions FOR SELECT
  USING (
    profile_id = auth.uid()
    OR profile_id IN (SELECT id FROM public.profiles WHERE parent_id = auth.uid())
  );

-- ── owner_expenses ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages expenses" ON public.owner_expenses;
CREATE POLICY "Chain owner manages expenses"
  ON public.owner_expenses FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── machines ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages machines" ON public.machines;
CREATE POLICY "Chain owner manages machines"
  ON public.machines FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── machine_entries ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages machine entries" ON public.machine_entries;
CREATE POLICY "Chain owner manages machine entries"
  ON public.machine_entries FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── machine_float_sessions ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages float sessions" ON public.machine_float_sessions;
CREATE POLICY "Chain owner manages float sessions"
  ON public.machine_float_sessions FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── opened_bottles ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages opened bottles" ON public.opened_bottles;
CREATE POLICY "Chain owner manages opened bottles"
  ON public.opened_bottles FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── opened_packs ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages opened packs" ON public.opened_packs;
CREATE POLICY "Chain owner manages opened packs"
  ON public.opened_packs FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── bar_sort_order ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages sort order" ON public.bar_sort_order;
CREATE POLICY "Chain owner manages sort order"
  ON public.bar_sort_order FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));

-- ── profiles — allow chain owner to see/manage cashiers under their bar sub-accounts ──
DROP POLICY IF EXISTS "Chain owner views bar cashiers" ON public.profiles;
CREATE POLICY "Chain owner views bar cashiers"
  ON public.profiles FOR SELECT
  USING (
    -- already covered: id = auth.uid(), parent_id = auth.uid(), get_owner_id(auth.uid())
    -- new: cashiers whose parent is one of the chain owner's bar sub-accounts
    parent_id IN (
      SELECT id FROM public.profiles
      WHERE parent_id = auth.uid()
        AND is_bar_account = true
    )
  );

-- ── specials ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Chain owner manages specials" ON public.specials;
CREATE POLICY "Chain owner manages specials"
  ON public.specials FOR ALL
  USING (public.is_owner_in_scope(owner_id))
  WITH CHECK (public.is_owner_in_scope(owner_id));
