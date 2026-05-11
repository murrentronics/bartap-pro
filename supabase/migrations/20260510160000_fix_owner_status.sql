-- Approve all existing owner accounts that are still pending
UPDATE public.profiles
SET status = 'approved'
WHERE role = 'owner' AND status = 'pending';

-- Auto-approve new owner signups (cashiers stay pending for owner to manage)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
DECLARE
  _role public.app_role;
  _status public.user_status;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'owner');
  -- Owners are auto-approved; cashiers start as approved too (owner created them intentionally)
  _status := 'approved';

  INSERT INTO public.profiles (id, username, role, parent_id, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    _role,
    NULLIF(NEW.raw_user_meta_data->>'parent_id', '')::uuid,
    _status
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
