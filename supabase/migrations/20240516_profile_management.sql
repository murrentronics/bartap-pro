-- ============================================================
-- MIGRATION: Profile Management & Account Deletion
-- ============================================================

-- Function to allow users to delete their own account
-- This will cascade delete all related data (cashiers, products, orders, transactions)
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  _user_id uuid := auth.uid();
  _role public.app_role;
BEGIN
  -- Get the user's role
  SELECT role INTO _role FROM public.profiles WHERE id = _user_id;
  
  -- Only owners can delete their own account (not cashiers or admins)
  IF _role IS NULL OR _role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can delete their own account';
  END IF;
  
  -- Delete from profiles first (this will cascade to all related data)
  -- Due to ON DELETE CASCADE constraints, this will automatically delete:
  -- - All cashiers (parent_id references)
  -- - All products (owner_id references)
  -- - All orders (owner_id and cashier_id references)
  -- - All wallet_transactions (profile_id references)
  DELETE FROM public.profiles WHERE id = _user_id;
  
  -- Delete from auth.users (this will also trigger the profile deletion if not already deleted)
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

-- Grant execute permission to authenticated users
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

COMMENT ON FUNCTION public.delete_own_account() IS 
'Allows an owner to delete their own account and all associated data. Cashiers and admins cannot use this function.';

-- ============================================================
-- IMPORTANT: Supabase Auth Email Redirect URL Configuration
-- ============================================================
-- After running this migration, you MUST add these URLs to your
-- Supabase project's allowed redirect URLs:
--
-- Go to: Supabase Dashboard > Authentication > URL Configuration
--
-- Add ALL of these to "Redirect URLs":
--   https://bartendaz-pro.pages.dev/#/login
--   https://bartendaz-pro.pages.dev/#/profile
--   http://localhost:5173/#/login
--   http://localhost:5173/#/profile
--   bartendazpro://reset-password
--   bartendazpro://email-confirm
--
-- Also set "Site URL" to:
--   https://bartendaz-pro.pages.dev
--
-- The app now uses hash-based redirect URLs (/#/login) which
-- work correctly with the HashRouter used in the app.
-- ============================================================
