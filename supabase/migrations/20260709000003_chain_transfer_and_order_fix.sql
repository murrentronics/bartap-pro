-- ─────────────────────────────────────────────────────────────────────────────
-- Chain owner acting as bar fix.
-- When La Columbiana (master) acts as Bar 2 (cryaty):
--   cashier_id = master_id, owner_id = bar2_id
-- All three functions need to treat this as a direct owner sale, not a cashier sale.
--
-- Rule: if cashier_id is the parent of owner_id (is_bar_account=true),
--       treat it as owner_is_cashier = true.
--
-- ONLY these three functions are changed. Nothing else is touched.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. handle_order_insert ───────────────────────────────────────────────────
-- Exact copy of 20260624000012_cashier_sale_note_fix.sql +
-- chain master check so Bar 2 owner sales don't show as cashier sales.
CREATE OR REPLACE FUNCTION public.handle_order_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cashier_username TEXT;
  v_items_text       TEXT;
  v_is_chain_master  BOOLEAN;
BEGIN
  -- 1. Credit the wallet of whoever made the sale.
  --    For chain master acting as bar: cashier_id = master, but we want
  --    the bar (owner_id) to get the credit, not the master.
  --    Detect: cashier_id is parent of owner_id AND owner is_bar_account.
  SELECT (parent_id = NEW.cashier_id AND is_bar_account = true)
    INTO v_is_chain_master
    FROM public.profiles
   WHERE id = NEW.owner_id;

  IF COALESCE(v_is_chain_master, false) THEN
    -- Chain master acting as bar — credit the BAR's wallet, not master's
    UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.owner_id;
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
      VALUES (NEW.owner_id, NEW.total, 'sale', 'Order sale', NEW.id);
  ELSE
    -- Normal flow: credit the cashier's wallet
    UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.cashier_id;
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
      VALUES (NEW.cashier_id, NEW.total, 'sale', 'Order sale', NEW.id);

    -- Write read-only cashier_sale record to owner's feed (only for real cashiers)
    IF NEW.cashier_id IS DISTINCT FROM NEW.owner_id THEN
      SELECT username INTO v_cashier_username
        FROM public.profiles WHERE id = NEW.cashier_id;

      SELECT string_agg(
        (item->>'qty') || 'x ' || (item->>'name'), ', '
      )
      INTO v_items_text
      FROM jsonb_array_elements(NEW.items::jsonb) AS item;

      INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
      VALUES (
        NEW.owner_id,
        NEW.total,
        'cashier_sale',
        'Cashier: ' || COALESCE(v_cashier_username, 'Unknown')
          || ' | Total: $'  || NEW.total::text
          || ' · Paid: $'   || COALESCE(NEW.paid::text, NEW.total::text)
          || ' · Change: $' || COALESCE(NEW.change_given::text, '0')
          || ' | ' || COALESCE(v_items_text, ''),
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. record_credit_charge ──────────────────────────────────────────────────
-- Exact copy of 20260628000007_wallet_tx_credit_tx_ref.sql +
-- chain master check so Bar 2 credit sales don't show as cashier sales.
CREATE OR REPLACE FUNCTION public.record_credit_charge(
  p_credit_account_id UUID,
  p_cashier_id        UUID,
  p_amount            NUMERIC,
  p_items             JSONB,
  p_note              TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner_id         UUID;
  v_account_name     TEXT;
  v_cashier_name     TEXT;
  v_old_balance      NUMERIC;
  v_new_balance      NUMERIC;
  v_owner_is_cashier BOOLEAN;
  v_is_chain_master  BOOLEAN;
  v_item             JSONB;
  v_credit_tx_id     UUID;
BEGIN
  SELECT owner_id, full_name, balance_owed
    INTO v_owner_id, v_account_name, v_old_balance
    FROM public.credit_accounts WHERE id = p_credit_account_id;

  SELECT username INTO v_cashier_name FROM public.profiles WHERE id = p_cashier_id;

  v_new_balance := v_old_balance + p_amount;

  -- Treat as owner sale if: cashier = owner directly,
  -- OR cashier is the chain master of the bar (parent of owner_id)
  SELECT (parent_id = p_cashier_id AND is_bar_account = true)
    INTO v_is_chain_master
    FROM public.profiles WHERE id = v_owner_id;

  v_owner_is_cashier := (p_cashier_id = v_owner_id) OR COALESCE(v_is_chain_master, false);

  -- 1. Insert credit transaction
  INSERT INTO public.credit_transactions
    (credit_account_id, owner_id, cashier_id, type, amount, items, note)
  VALUES (
    p_credit_account_id, v_owner_id, p_cashier_id, 'charge', p_amount, p_items,
    COALESCE(p_note, 'Credit sale')
  )
  RETURNING id INTO v_credit_tx_id;

  -- 2. Update balance_owed
  UPDATE public.credit_accounts
     SET balance_owed = v_new_balance, status = 'open', updated_at = now()
   WHERE id = p_credit_account_id;

  -- 3. Restore stock (skip synthetic ids)
  IF p_items IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
      CONTINUE WHEN (v_item->>'id') LIKE 'shot-%' OR (v_item->>'id') LIKE 'pack-%';
      UPDATE public.products
         SET stock_qty = GREATEST(0, stock_qty - COALESCE((v_item->>'qty')::integer, 0))
       WHERE id = (v_item->>'id')::uuid;
    END LOOP;
  END IF;

  -- 4. Owner wallet record
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, credit_tx_id)
  VALUES (
    v_owner_id, 0, 'credit_charge',
    'Credit: ' || COALESCE(v_account_name, 'Customer')
      || ' | $' || p_amount::text
      || ' | Balance owed: $' || v_new_balance::text
      || CASE WHEN v_owner_is_cashier THEN ''
              ELSE ' | Cashier: ' || COALESCE(v_cashier_name, 'Unknown') END
      || CASE WHEN p_note IS NOT NULL AND p_note <> ''
              THEN ' | Items: ' || p_note ELSE '' END,
    v_credit_tx_id
  );

  -- 5. Cashier wallet record (only when cashier ≠ owner and not chain master)
  IF NOT v_owner_is_cashier THEN
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note, credit_tx_id)
    VALUES (
      p_cashier_id, 0, 'credit_charge',
      'Credit: ' || COALESCE(v_account_name, 'Customer')
        || ' | $' || p_amount::text
        || ' | Balance owed: $' || v_new_balance::text
        || CASE WHEN p_note IS NOT NULL AND p_note <> ''
                THEN ' | Items: ' || p_note ELSE '' END,
      v_credit_tx_id
    );
  END IF;
END;
$$;

-- ── 3. transfer_cashier_to_owner ─────────────────────────────────────────────
-- Exact copy of 20260512000001_transfer_note_cashier_name.sql +
-- grandparent check so chain master can clear bar sub-account cashiers.
CREATE OR REPLACE FUNCTION public.transfer_cashier_to_owner(_cashier_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bal         NUMERIC;
  _parent      UUID;
  _username    TEXT;
  _caller      UUID := auth.uid();
  _grandparent UUID;
BEGIN
  SELECT wallet_balance, parent_id, username
    INTO _bal, _parent, _username
    FROM public.profiles
   WHERE id = _cashier_id;

  -- Allow if caller is direct parent OR grandparent (chain master)
  IF _parent IS NULL OR _parent <> _caller THEN
    SELECT parent_id INTO _grandparent FROM public.profiles WHERE id = _parent;
    IF _grandparent IS NULL OR _grandparent <> _caller THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;
  END IF;

  IF _bal > 0 THEN
    UPDATE public.profiles SET wallet_balance = 0                    WHERE id = _cashier_id;
    UPDATE public.profiles SET wallet_balance = wallet_balance + _bal WHERE id = _parent;

    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
      VALUES (_cashier_id, -_bal, 'transfer_out', 'Cleared to owner');

    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
      VALUES (_parent, _bal, 'transfer_in', 'Cleared from cashier: ' || _username);
  END IF;
END;
$$;
