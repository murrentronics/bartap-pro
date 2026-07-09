-- Recreate create_bar_account using supabase_auth_admin role for auth.users insert
-- Also adds all missing GRANT EXECUTE statements

-- ── Drop old version first (signature changed) ───────────────────────────────
DROP FUNCTION IF EXISTS public.create_bar_account(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.delete_bar_account(uuid, uuid);
DROP FUNCTION IF EXISTS public.get_chain_bars(uuid);
DROP FUNCTION IF EXISTS public.update_bar_account(uuid, uuid, text, text, boolean);

-- ── get_chain_bars ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_chain_bars(p_owner_id UUID)
RETURNS TABLE (
  id            UUID,
  bar_name      TEXT,
  bar_location  TEXT,
  has_machines  BOOLEAN,
  bar_number    INTEGER,
  created_at    TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.username                               AS bar_name,
    COALESCE(p.address, '')                  AS bar_location,
    COALESCE(p.machines_addon_active, false) AS has_machines,
    ROW_NUMBER() OVER (ORDER BY p.created_at)::INTEGER AS bar_number,
    p.created_at
  FROM public.profiles p
  WHERE
    p.id = p_owner_id
    OR (p.parent_id = p_owner_id AND p.is_bar_account = true)
  ORDER BY p.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_chain_bars(uuid) TO authenticated;

-- ── create_bar_account ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_bar_account(
  p_owner_id     UUID,
  p_name         TEXT,
  p_location     TEXT,
  p_has_machines BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_new_user_id   UUID;
  v_bar_count     INTEGER;
  v_caller_id     UUID := auth.uid();
  v_fake_email    TEXT;
BEGIN
  -- Security: only the chain owner themselves can call this
  IF v_caller_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Check chain plan is active
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_owner_id AND plan_type = 'chain'
  ) THEN
    RAISE EXCEPTION 'Chain plan not active';
  END IF;

  -- Count existing sub-accounts (master bar doesn't count against the 10 sub limit)
  SELECT COUNT(*) INTO v_bar_count
  FROM public.profiles
  WHERE parent_id = p_owner_id AND is_bar_account = true;

  IF v_bar_count >= 9 THEN
    -- 9 sub-accounts + 1 master = 10 total
    RAISE EXCEPTION 'Maximum 10 bars reached';
  END IF;

  v_new_user_id := gen_random_uuid();
  v_fake_email  := 'bar-' || v_new_user_id::text || '@chain.internal';

  -- Insert auth user via supabase_auth_admin
  PERFORM extensions.pgcrypto_gen_random_bytes(1); -- ensure pgcrypto available

  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    role,
    is_super_admin
  ) VALUES (
    v_new_user_id,
    '00000000-0000-0000-0000-000000000000',
    v_fake_email,
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    jsonb_build_object('username', p_name, 'role', 'owner'),
    now(),
    now(),
    'authenticated',
    'authenticated',
    false
  );

  -- Insert profile row
  INSERT INTO public.profiles (
    id,
    username,
    role,
    parent_id,
    wallet_balance,
    status,
    address,
    is_bar_account,
    machines_addon_active,
    plan_type,
    chain_addon_active,
    billing_status
  ) VALUES (
    v_new_user_id,
    p_name,
    'owner',
    p_owner_id,
    0,
    'approved',
    p_location,
    true,
    p_has_machines,
    'chain',
    false,
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    username              = EXCLUDED.username,
    parent_id             = EXCLUDED.parent_id,
    status                = EXCLUDED.status,
    address               = EXCLUDED.address,
    is_bar_account        = EXCLUDED.is_bar_account,
    machines_addon_active = EXCLUDED.machines_addon_active,
    plan_type             = EXCLUDED.plan_type;

  -- Increment bar count on master
  UPDATE public.profiles
  SET chain_bar_count = COALESCE(chain_bar_count, 1) + 1
  WHERE id = p_owner_id;

  RETURN jsonb_build_object('bar_id', v_new_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bar_account(uuid, text, text, boolean) TO authenticated;

-- ── delete_bar_account ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_bar_account(
  p_bar_id   UUID,
  p_owner_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_bar_id
      AND parent_id = p_owner_id
      AND is_bar_account = true
  ) THEN
    RAISE EXCEPTION 'Bar not found or not owned by caller';
  END IF;

  DELETE FROM auth.users WHERE id = p_bar_id;

  UPDATE public.profiles
  SET chain_bar_count = GREATEST(1, chain_bar_count - 1)
  WHERE id = p_owner_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_bar_account(uuid, uuid) TO authenticated;

-- ── update_bar_account ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_bar_account(
  p_bar_id       UUID,
  p_owner_id     UUID,
  p_bar_name     TEXT,
  p_location     TEXT,
  p_has_machines BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS DISTINCT FROM p_owner_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.profiles
  SET
    username              = p_bar_name,
    address               = p_location,
    machines_addon_active = p_has_machines
  WHERE id = p_bar_id
    AND parent_id = p_owner_id
    AND is_bar_account = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_bar_account(uuid, uuid, text, text, boolean) TO authenticated;

-- ── Fix chain_bar_count for existing chain owners ─────────────────────────────
UPDATE public.profiles AS master
SET chain_bar_count = 1 + COALESCE((
  SELECT COUNT(*)::INTEGER
  FROM public.profiles sub
  WHERE sub.parent_id = master.id
    AND sub.is_bar_account = true
), 0)
WHERE master.plan_type = 'chain';
