-- ── Master account: permanently set renard.sankersingh@gmail.com to premium ──
-- This ensures all server-side checks (edge functions, RLS, etc.) see this
-- account as an active premium owner regardless of billing status.

UPDATE public.profiles
SET
  status                          = 'approved',
  billing_status                  = 'active',
  plan_type                       = 'premium',
  machines_addon_active           = true,
  music_addon                     = true,
  -- Set a far-future subscription end date so expiry cron never suspends this account
  subscription_start_date         = now(),
  subscription_end_date           = '2099-12-31 23:59:59+00'::timestamptz,
  premium_subscription_start_date = now(),
  premium_subscription_end_date   = '2099-12-31 23:59:59+00'::timestamptz
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'renard.sankersingh@gmail.com'
  LIMIT 1
);
