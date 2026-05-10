-- Admin: list profiles + emails
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS TABLE (
  id uuid, username text, role public.app_role, status public.user_status,
  wallet_balance numeric, created_at timestamptz, parent_id uuid, email text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  RETURN QUERY
    SELECT p.id, p.username, p.role, p.status, p.wallet_balance, p.created_at, p.parent_id,
           COALESCE(u.email, '')::text
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.admin_list_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

-- Admin: delete a user (cascades to profiles via FK if present, otherwise also deletes profile row)
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  DELETE FROM public.profiles WHERE id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;