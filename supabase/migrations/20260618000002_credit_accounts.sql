-- ─────────────────────────────────────────────────────────────────────────────
-- Credit accounts system
-- Tracks bar tabs / credit for customers
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.credit_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  contact_number  TEXT,
  id_image_url    TEXT,
  id_number       TEXT,
  balance_owed    NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('open', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View credit accounts in scope"
  ON public.credit_accounts FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Insert credit accounts"
  ON public.credit_accounts FOR INSERT
  WITH CHECK (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Update credit accounts in scope"
  ON public.credit_accounts FOR UPDATE
  USING (owner_id = public.get_owner_id(auth.uid()));

-- Transactions for credit (charges + payments)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_account_id  UUID NOT NULL REFERENCES public.credit_accounts(id) ON DELETE CASCADE,
  owner_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cashier_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  type               TEXT NOT NULL CHECK (type IN ('charge', 'payment')),
  amount             NUMERIC(12,2) NOT NULL,
  note               TEXT,
  items              JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View credit transactions in scope"
  ON public.credit_transactions FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));

CREATE POLICY "Insert credit transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (owner_id = public.get_owner_id(auth.uid()) AND cashier_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_accounts_owner   ON public.credit_accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_status  ON public.credit_accounts(status);
CREATE INDEX IF NOT EXISTS idx_credit_tx_account       ON public.credit_transactions(credit_account_id);

-- Trigger: update updated_at on credit_accounts
CREATE TRIGGER update_credit_accounts_updated_at
  BEFORE UPDATE ON public.credit_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function: record a credit charge (called when cashier completes a credit sale)
-- Inserts wallet_transactions record for owner (read-only / amount=0 same as cashier_sale),
-- inserts credit_transaction, and updates balance_owed + status on credit_account.
CREATE OR REPLACE FUNCTION public.record_credit_charge(
  p_credit_account_id UUID,
  p_cashier_id        UUID,
  p_amount            NUMERIC,
  p_items             JSONB,
  p_note              TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_owner_id      UUID;
  v_account_name  TEXT;
  v_cashier_name  TEXT;
BEGIN
  SELECT owner_id, full_name INTO v_owner_id, v_account_name
    FROM public.credit_accounts WHERE id = p_credit_account_id;

  SELECT username INTO v_cashier_name
    FROM public.profiles WHERE id = p_cashier_id;

  -- 1. Insert credit transaction (charge)
  INSERT INTO public.credit_transactions
    (credit_account_id, owner_id, cashier_id, type, amount, items, note)
  VALUES
    (p_credit_account_id, v_owner_id, p_cashier_id, 'charge', p_amount, p_items,
     COALESCE(p_note, 'Credit sale'));

  -- 2. Update balance_owed and open the account
  UPDATE public.credit_accounts
  SET balance_owed = balance_owed + p_amount,
      status       = 'open',
      updated_at   = now()
  WHERE id = p_credit_account_id;

  -- 3. Write read-only owner wallet record (amount=0, informational only)
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
  VALUES (
    v_owner_id,
    0,
    'credit_charge',
    'Credit: ' || COALESCE(v_account_name, 'Customer')
      || ' | $' || p_amount::text
      || COALESCE(' | Cashier: ' || v_cashier_name, '')
  );
END;
$$;

-- Function: record a credit payment (customer pays toward balance)
-- Inserts wallet_transactions as a real DEBIT record (negative = money collected),
-- inserts credit_transaction, updates balance_owed, auto-closes if fully paid.
CREATE OR REPLACE FUNCTION public.record_credit_payment(
  p_credit_account_id UUID,
  p_cashier_id        UUID,
  p_amount            NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_owner_id       UUID;
  v_account_name   TEXT;
  v_cashier_name   TEXT;
  v_new_balance    NUMERIC;
BEGIN
  SELECT owner_id, full_name INTO v_owner_id, v_account_name
    FROM public.credit_accounts WHERE id = p_credit_account_id;

  SELECT username INTO v_cashier_name
    FROM public.profiles WHERE id = p_cashier_id;

  -- 1. Insert credit transaction (payment)
  INSERT INTO public.credit_transactions
    (credit_account_id, owner_id, cashier_id, type, amount, note)
  VALUES
    (p_credit_account_id, v_owner_id, p_cashier_id, 'payment', p_amount,
     'Payment received');

  -- 2. Update balance, auto-close if fully settled
  UPDATE public.credit_accounts
  SET balance_owed = GREATEST(0, balance_owed - p_amount),
      status       = CASE WHEN (balance_owed - p_amount) <= 0 THEN 'closed' ELSE 'open' END,
      updated_at   = now()
  WHERE id = p_credit_account_id
  RETURNING balance_owed INTO v_new_balance;

  -- 3. Write real debit wallet record for the owner (money collected)
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
  VALUES (
    v_owner_id,
    p_amount,
    'credit_payment',
    'Credit payment: ' || COALESCE(v_account_name, 'Customer')
      || ' | $' || p_amount::text
      || COALESCE(' | Cashier: ' || v_cashier_name, '')
  );

  -- 4. Also update cashier wallet for receiving the payment
  UPDATE public.profiles
  SET wallet_balance = wallet_balance + p_amount
  WHERE id = p_cashier_id;

  INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
  VALUES (
    p_cashier_id,
    p_amount,
    'credit_payment',
    'Credit payment collected: ' || COALESCE(v_account_name, 'Customer')
  );
END;
$$;
