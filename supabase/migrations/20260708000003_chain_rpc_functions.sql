-- ============================================================
-- Chain of Bars Plan — Phase 1, Steps 4, 5, 6
-- RPC functions for chain bar management.
--
-- IMPORTANT DESIGN NOTE:
-- profiles.id is a FK to auth.users(id), so bar sub-accounts
-- cannot be plain profile rows without auth users.
-- Solution: bar sub-accounts ARE real profiles/auth users,
-- created via a SECURITY DEFINER function that uses the
-- service role to insert into auth.users with a random
-- password (chain owner never logs in as the bar — they use
-- context switching via active_bar_id in the app).
-- The bar profile has role='owner', parent_id=chain_owner_id,
-- is_bar_account=true, status='approved'.
-- ============================================================

-- ── get_chain_bars ───────────────────────────────────────────────────────────
-- Returns all bar sub-accounts for the calling chain owner.
-- Called by ChainContext on mount to populate the bar list.
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
    p.username          AS bar_name,
    COALESCE(p.address, '') AS bar_location,
    COALESCE(p.machines_addon_active, false) AS has_machines,
    ROW_NUMBER() OVER (ORDER BY p.created_at)::INTEGER AS bar_number,
    p.created_at
  FROM public.profiles p
  WHERE p.parent_id = p_owner_id
    AND p.is_bar_account = true
  ORDER BY p.created_at;
$$;

-- ── create_bar_account ───────────────────────────────────────────────────────
-- Creates a new bar sub-account under the chain owner.
-- Uses auth.users insert via service role (SECURITY DEFINER).
-- Increments chain_bar_count on the master profile.
-- Returns the new bar's profile id.
CREATE OR REPLACE FUNCTION public.create_bar_account(
  p_owner_id    UUID,
  p_bar_name    TEXT,
  p_location    TEXT,
  p_has_machines BOOLEAN DEFAULT false
)
RETURNS UUID
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
  IF v_caller_id <> p_owner_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Check chain plan is active
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_owner_id AND chain_addon_active = true
  ) THEN
    RAISE EXCEPTION 'Chain plan not active';
  END IF;

  -- Enforce 10-bar limit
  SELECT chain_bar_count INTO v_bar_count
  FROM public.profiles WHERE id = p_owner_id;

  IF v_bar_count >= 10 THEN
    RAISE EXCEPTION 'Maximum 10 bars reached';
  END IF;

  -- Generate a unique fake email for the bar auth user
  -- (never used for login — chain owner accesses via context switch)
  v_new_user_id := gen_random_uuid();
  v_fake_email  := 'bar-' || v_new_user_id::text || '@chain.internal';

  -- Insert into auth.users (service role required — SECURITY DEFINER grants this)
  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    role
  ) VALUES (
    v_new_user_id,
    v_fake_email,
    -- Random bcrypt hash — this account can never be logged into directly
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    jsonb_build_object(
      'username',  p_bar_name,
      'role',      'owner',
      'parent_id', p_owner_id::text
    ),
    now(),
    now(),
    'authenticated',
    'authenticated'
  );

  -- Insert profile row (handle_new_user trigger fires but we set values explicitly too)
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
    plan_type
  ) VALUES (
    v_new_user_id,
    p_bar_name,
    'owner',
    p_owner_id,
    0,
    'approved',
    p_location,
    true,
    p_has_machines,
    'chain'
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
  SET chain_bar_count = chain_bar_count + 1
  WHERE id = p_owner_id;

  RETURN v_new_user_id;
END;
$$;

-- ── delete_bar_account ───────────────────────────────────────────────────────
-- Deletes a bar sub-account and ALL its data (cascade via FK).
-- Decrements chain_bar_count on the master profile.
-- NOTE: wired for future use — UI will call this eventually.
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
  -- Security: only the chain owner themselves can delete a bar
  IF v_caller_id <> p_owner_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Confirm this bar belongs to the caller
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_bar_id
      AND parent_id = p_owner_id
      AND is_bar_account = true
  ) THEN
    RAISE EXCEPTION 'Bar not found or not owned by caller';
  END IF;

  -- Delete auth user (cascades to profiles and all FK tables)
  DELETE FROM auth.users WHERE id = p_bar_id;

  -- Decrement bar count (floor at 0)
  UPDATE public.profiles
  SET chain_bar_count = GREATEST(0, chain_bar_count - 1)
  WHERE id = p_owner_id;
END;
$$;

-- ── update_bar_account ───────────────────────────────────────────────────────
-- Allows chain owner to rename a bar or toggle machines.
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
  IF v_caller_id <> p_owner_id THEN
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
