-- Status enum
DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('pending','approved','suspended','expelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add status column to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.user_status NOT NULL DEFAULT 'pending';

-- Approve all existing users so they aren't suddenly locked out
UPDATE public.profiles SET status = 'approved' WHERE status = 'pending';

-- Admin check function
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'admin'); $$;

-- Auto-create profile trigger for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role, parent_id, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'owner'),
    NULLIF(NEW.raw_user_meta_data->>'parent_id','')::uuid,
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Promote admin@gmail.com if it exists
UPDATE public.profiles SET role = 'admin', status = 'approved'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@gmail.com');

-- Allow admins to view + update any profile (RLS)
DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin(auth.uid()));

-- Realtime
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;