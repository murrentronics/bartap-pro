-- Create admin profile for renard@bartendazpro.com
-- Run AFTER creating the auth user via Dashboard → Authentication → Users → Invite user

INSERT INTO public.profiles (id, username, role, status, wallet_balance)
SELECT
  au.id,
  'renard',
  'admin',
  'approved',
  0
FROM auth.users au
WHERE au.email = 'renard@bartendazpro.com'
ON CONFLICT (id) DO UPDATE
  SET role   = 'admin',
      status = 'approved';
