-- ============================================================
-- Chain of Bars Plan — Phase 1, Step 3
-- RLS access for chain owners to their bar sub-accounts.
--
-- STRATEGY: Rather than adding a new policy to every table,
-- we create a helper function get_chain_bar_ids() that returns
-- the list of bar sub-account IDs for the current chain owner.
-- Then we add ONE new policy per table using that helper.
--
-- Existing policies are NEVER modified — only new ones added.
-- Single-bar owners are completely unaffected.
-- ============================================================

-- ── Helper: returns all bar sub-account IDs for a chain owner ──────────────
-- If the caller is not a chain owner, returns an empty array.
CREATE OR REPLACE FUNCTION public.get_chain_bar_ids(_user_id UUID)
RETURNS UUID[]
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(
    SELECT id FROM public.profiles
    WHERE parent_id = _user_id
      AND is_bar_account = true
  );
$$;

-- ── Helper: check if a given owner_id belongs to one of the caller's bars ──
CREATE OR REPLACE FUNCTION public.is_chain_bar_of(_user_id UUID, _owner_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _owner_id
      AND parent_id = _user_id
      AND is_bar_account = true
  );
$$;

-- ── profiles: chain owner can view their bar sub-accounts ──────────────────
-- (existing "View own profile" policy already covers id = auth.uid() and cashiers)
CREATE POLICY "Chain owner views bar sub-accounts"
  ON public.profiles FOR SELECT
  USING (
    parent_id = auth.uid() AND is_bar_account = true
  );

-- Chain owner can update bar sub-account profiles (e.g. name, location)
CREATE POLICY "Chain owner updates bar sub-accounts"
  ON public.profiles FOR UPDATE
  USING (
    parent_id = auth.uid() AND is_bar_account = true
  );

-- ── products ────────────────────────────────────────────────────────────────
CREATE POLICY "Chain owner manages bar products"
  ON public.products FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── orders ──────────────────────────────────────────────────────────────────
CREATE POLICY "Chain owner views bar orders"
  ON public.orders FOR SELECT
  USING (public.is_chain_bar_of(auth.uid(), owner_id));

CREATE POLICY "Chain owner deletes bar orders"
  ON public.orders FOR DELETE
  USING (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── wallet_transactions ──────────────────────────────────────────────────────
CREATE POLICY "Chain owner views bar wallet transactions"
  ON public.wallet_transactions FOR SELECT
  USING (public.is_chain_bar_of(auth.uid(), profile_id));

-- ── credit_accounts ─────────────────────────────────────────────────────────
CREATE POLICY "Chain owner manages bar credit accounts"
  ON public.credit_accounts FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── credit_transactions ──────────────────────────────────────────────────────
CREATE POLICY "Chain owner views bar credit transactions"
  ON public.credit_transactions FOR SELECT
  USING (public.is_chain_bar_of(auth.uid(), owner_id));

CREATE POLICY "Chain owner deletes bar credit transactions"
  ON public.credit_transactions FOR DELETE
  USING (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── owner_expenses ───────────────────────────────────────────────────────────
CREATE POLICY "Chain owner manages bar expenses"
  ON public.owner_expenses FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── owner_financials ─────────────────────────────────────────────────────────
CREATE POLICY "Chain owner manages bar financials"
  ON public.owner_financials FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── machines ─────────────────────────────────────────────────────────────────
CREATE POLICY "Chain owner manages bar machines"
  ON public.machines FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── machine_entries ──────────────────────────────────────────────────────────
CREATE POLICY "Chain owner manages bar machine entries"
  ON public.machine_entries FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── machine_float_sessions ───────────────────────────────────────────────────
CREATE POLICY "Chain owner manages bar float sessions"
  ON public.machine_float_sessions FOR ALL
  USING  (public.is_chain_bar_of(auth.uid(), owner_id))
  WITH CHECK (public.is_chain_bar_of(auth.uid(), owner_id));

-- ── subscription_payments ────────────────────────────────────────────────────
CREATE POLICY "Chain owner views bar subscription payments"
  ON public.subscription_payments FOR SELECT
  USING (public.is_chain_bar_of(auth.uid(), owner_id));
