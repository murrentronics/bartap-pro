-- ============================================================
-- Fix isabel@gmail.com demo account
--
-- Sets her master profile to plan_type='chain' with
-- chain_addon_active=true, is_multi_bar=true, status='approved',
-- machines_addon_active=true (Bar + Machines on her own account).
--
-- Creates up to 2 bar+machines sub-accounts under her if they
-- don't already exist (idempotent — skips creation if they're
-- already there, which is the expected case from the screenshot):
--   Sub-account 1 — "crusty crabs" (sando) — Bar + Machines
--   Sub-account 2 — "bar"          (sando) — Bar + Machines
--
-- Sub-accounts are real auth.users rows (fake email, random
-- password — never logged into directly). Same pattern used
-- by the create-bar and create-addon-bars edge functions.
-- ============================================================

DO $$
DECLARE
  v_owner_id       UUID;
  v_existing_count INTEGER;
  v_bar_id         UUID;
  v_fake_email     TEXT;
BEGIN
  -- ── 1. Find isabel's auth user id ──────────────────────────────────────
  SELECT id INTO v_owner_id
  FROM auth.users
  WHERE email = 'isabel@gmail.com'
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'isabel@gmail.com not found in auth.users — skipping migration';
    RETURN;
  END IF;

  -- ── 2. Ensure her master profile is chain ──────────────────────────────
  UPDATE public.profiles
  SET
    plan_type          = 'chain',
    chain_addon_active = true,
    is_multi_bar       = true,
    status             = 'approved',
    billing_status     = 'active',
    machines_addon_active = true   -- her own bar (bar 1) has machines
  WHERE id = v_owner_id;

  -- ── 3. Count existing sub-accounts ────────────────────────────────────
  SELECT COUNT(*) INTO v_existing_count
  FROM public.profiles
  WHERE parent_id = v_owner_id
    AND is_bar_account = true;

  RAISE NOTICE 'isabel@gmail.com (%) already has % sub-accounts', v_owner_id, v_existing_count;

  -- ── 4. Create sub-accounts up to 2 total ──────────────────────────────
  -- Sub-account 1: "crusty crabs" style — first extra bar
  IF v_existing_count < 1 THEN
    v_bar_id     := gen_random_uuid();
    v_fake_email := 'bar-' || v_bar_id::text || '@chain.internal';

    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, aud, role
    ) VALUES (
      v_bar_id,
      v_fake_email,
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      jsonb_build_object('username', 'crusty crabs', 'role', 'owner', 'parent_id', v_owner_id::text),
      now(), now(), 'authenticated', 'authenticated'
    );

    INSERT INTO public.profiles (
      id, username, role, parent_id, wallet_balance, status,
      address, is_bar_account, is_machines_account, machines_addon_active,
      bar_addon_active, plan_type, chain_addon_active, billing_status, music_addon
    ) VALUES (
      v_bar_id, 'crusty crabs', 'owner', v_owner_id, 0, 'approved',
      'sando', true, false, true,
      true, 'chain', false, 'active', true
    ) ON CONFLICT (id) DO NOTHING;

    v_existing_count := v_existing_count + 1;
    RAISE NOTICE 'Created sub-account 1: crusty crabs (%)', v_bar_id;
  END IF;

  -- Sub-account 2: second extra bar
  IF v_existing_count < 2 THEN
    v_bar_id     := gen_random_uuid();
    v_fake_email := 'bar-' || v_bar_id::text || '@chain.internal';

    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at, aud, role
    ) VALUES (
      v_bar_id,
      v_fake_email,
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      jsonb_build_object('username', 'bar', 'role', 'owner', 'parent_id', v_owner_id::text),
      now() + interval '1 second', now() + interval '1 second',
      'authenticated', 'authenticated'
    );

    INSERT INTO public.profiles (
      id, username, role, parent_id, wallet_balance, status,
      address, is_bar_account, is_machines_account, machines_addon_active,
      bar_addon_active, plan_type, chain_addon_active, billing_status, music_addon
    ) VALUES (
      v_bar_id, 'bar', 'owner', v_owner_id, 0, 'approved',
      'sando', true, false, true,
      true, 'chain', false, 'active', true
    ) ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created sub-account 2: bar (%)', v_bar_id;
  END IF;

  -- ── 5. Sync chain_bar_count on master to actual sub-account count ──────
  UPDATE public.profiles
  SET chain_bar_count = (
    SELECT COUNT(*)
    FROM public.profiles
    WHERE parent_id = v_owner_id
      AND is_bar_account = true
  )
  WHERE id = v_owner_id;

  RAISE NOTICE 'isabel@gmail.com chain setup complete';
END;
$$;
