-- Allow profiles to exist without a corresponding auth.users row.
-- This is needed for custom workers who have no login.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
