-- ============================================================
-- MIGRATION: Add Phone and Address Fields to Profiles
-- ============================================================

-- Add phone and address columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.phone IS 'Business phone number';
COMMENT ON COLUMN public.profiles.address IS 'Business physical address';

-- Update the handle_new_user function to include phone and address from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'owner');
  INSERT INTO public.profiles (id, username, role, parent_id, status, phone, address)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    _role,
    NULLIF(NEW.raw_user_meta_data->>'parent_id', '')::uuid,
    'pending',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'address'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
