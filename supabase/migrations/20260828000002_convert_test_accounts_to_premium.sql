-- ============================================================
-- Convert Isabel + Renard to standard premium (bar + 10 machines)
-- test accounts for QA purposes.
--
-- Isabel (isabel@gmail.com):
--   • Delete all chain sub-accounts (is_bar_account = true under her)
--   • Reset her master profile to premium, billing_status = 'active',
--     machines_addon_active = true, far-future expiry (like Renard).
--
-- Renard (renard.sankersingh@gmail.com):
--   • Already on premium with far-future expiry from a prior migration.
--   • This migration just ensures billing_status = 'active',
--     machines_addon_active = true, and clears any leftover chain flags.
--
-- Neither account is ever billed — exclusions are handled in the
-- frontend (AdminBillingManagementPage, admin.tsx revenue calc).
-- ============================================================

DO $$
DECLARE
  v_isabel_id  UUID;
  v_renard_id  UUID;
BEGIN

  -- ── 1. Resolve UUIDs ────────────────────────────────────────────────────
  SELECT id INTO v_isabel_id FROM auth.users WHERE email = 'isabel@gmail.com'   LIMIT 1;
  SELECT id INTO v_renard_id FROM auth.users WHERE email = 'renard.sankersingh@gmail.com' LIMIT 1;

  -- ── 2. Isabel — delete chain sub-accounts ───────────────────────────────
  IF v_isabel_id IS NOT NULL THEN

    -- Delete orders, wallet_transactions, products for each sub-account
    -- (cascade should handle most, but explicit cleanup avoids orphans)
    DELETE FROM public.profiles
    WHERE parent_id = v_isabel_id
      AND is_bar_account = true;

    RAISE NOTICE 'Deleted chain sub-accounts for isabel@gmail.com (%)', v_isabel_id;

    -- Reset Isabel's master profile to premium (bar + 10 machines)
    UPDATE public.profiles
    SET
      plan_type                       = 'premium',
      status                          = 'approved',
      billing_status                  = 'active',
      chain_addon_active              = false,
      chain_bar_count                 = 0,
      is_multi_bar                    = false,
      is_bar_account                  = false,
      is_machines_account             = false,
      machines_addon_active           = true,
      bar_addon_active                = true,
      addon_bar_count                 = 0,
      music_addon                     = true,
      subscription_start_date         = now(),
      subscription_end_date           = '2099-12-31 23:59:59+00'::timestamptz,
      premium_subscription_start_date = now(),
      premium_subscription_end_date   = '2099-12-31 23:59:59+00'::timestamptz
    WHERE id = v_isabel_id;

    RAISE NOTICE 'isabel@gmail.com reset to premium plan';

  ELSE
    RAISE NOTICE 'isabel@gmail.com not found in auth.users — skipping';
  END IF;

  -- ── 3. Renard — ensure clean premium state ───────────────────────────────
  IF v_renard_id IS NOT NULL THEN

    UPDATE public.profiles
    SET
      plan_type                       = 'premium',
      status                          = 'approved',
      billing_status                  = 'active',
      chain_addon_active              = false,
      chain_bar_count                 = 0,
      is_multi_bar                    = false,
      is_bar_account                  = false,
      is_machines_account             = false,
      machines_addon_active           = true,
      bar_addon_active                = true,
      addon_bar_count                 = 0,
      music_addon                     = true,
      subscription_start_date         = now(),
      subscription_end_date           = '2099-12-31 23:59:59+00'::timestamptz,
      premium_subscription_start_date = now(),
      premium_subscription_end_date   = '2099-12-31 23:59:59+00'::timestamptz
    WHERE id = v_renard_id;

    RAISE NOTICE 'renard.sankersingh@gmail.com reset to premium plan';

  ELSE
    RAISE NOTICE 'renard.sankersingh@gmail.com not found in auth.users — skipping';
  END IF;

END;
$$;
