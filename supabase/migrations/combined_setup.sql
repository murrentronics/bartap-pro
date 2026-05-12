-- ============================================================
-- MIGRATION 1: Core tables, RLS, triggers
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('owner', 'cashier');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  role public.app_role NOT NULL DEFAULT 'owner',
  parent_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_owner_id(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN role = 'owner' THEN id ELSE parent_id END
  FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_owner(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'owner');
$$;

CREATE POLICY "View own profile" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR parent_id = auth.uid() OR id = public.get_owner_id(auth.uid()));
CREATE POLICY "Update own profile" ON public.profiles FOR UPDATE
  USING (id = auth.uid());
CREATE POLICY "Insert self profile" ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  category TEXT NOT NULL DEFAULT 'drinks',
  stock_qty INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View products in scope" ON public.products FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));
CREATE POLICY "Owner inserts products" ON public.products FOR INSERT
  WITH CHECK (owner_id = auth.uid() AND public.is_owner(auth.uid()));
CREATE POLICY "Owner updates products" ON public.products FOR UPDATE
  USING (owner_id = auth.uid() AND public.is_owner(auth.uid()));
CREATE POLICY "Owner deletes products" ON public.products FOR DELETE
  USING (owner_id = auth.uid() AND public.is_owner(auth.uid()));

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  items JSONB NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  paid NUMERIC(12,2) NOT NULL,
  change_given NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View orders in scope" ON public.orders FOR SELECT
  USING (owner_id = public.get_owner_id(auth.uid()));
CREATE POLICY "Insert orders by self" ON public.orders FOR INSERT
  WITH CHECK (cashier_id = auth.uid() AND owner_id = public.get_owner_id(auth.uid()));

CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  type TEXT NOT NULL,
  note TEXT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own wallet tx" ON public.wallet_transactions FOR SELECT
  USING (profile_id = auth.uid() OR profile_id IN (SELECT id FROM public.profiles WHERE parent_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.handle_order_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET wallet_balance = wallet_balance + NEW.total WHERE id = NEW.cashier_id;
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note, order_id)
    VALUES (NEW.cashier_id, NEW.total, 'sale', 'Order sale', NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_order_insert AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_insert();

CREATE OR REPLACE FUNCTION public.transfer_cashier_to_owner(_cashier_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bal NUMERIC;
  _parent UUID;
  _caller UUID := auth.uid();
BEGIN
  SELECT wallet_balance, parent_id INTO _bal, _parent FROM public.profiles WHERE id = _cashier_id;
  IF _parent IS NULL OR _parent <> _caller THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _bal > 0 THEN
    UPDATE public.profiles SET wallet_balance = 0 WHERE id = _cashier_id;
    UPDATE public.profiles SET wallet_balance = wallet_balance + _bal WHERE id = _parent;
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
      VALUES (_cashier_id, -_bal, 'transfer_out', 'Cleared to owner');
    INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
      VALUES (_parent, _bal, 'transfer_in', 'Cleared from cashier');
  END IF;
END;
$$;

INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read product images" ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');
CREATE POLICY "Auth upload product images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "Auth update product images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete product images" ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);

-- ============================================================
-- MIGRATION 2: Realtime
-- ============================================================
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;

-- ============================================================
-- MIGRATION 3: Add admin role
-- ============================================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';

-- ============================================================
-- MIGRATION 4: Status enum + admin policies
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('pending','approved','suspended','expelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.user_status NOT NULL DEFAULT 'pending';

UPDATE public.profiles SET status = 'approved' WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id AND role = 'admin');
$$;

DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin(auth.uid()));

-- ============================================================
-- MIGRATION 5: Admin functions
-- ============================================================
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

-- ============================================================
-- MIGRATION 6: Auto-approve trigger + handle new user
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'owner');
  INSERT INTO public.profiles (id, username, role, parent_id, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    _role,
    NULLIF(NEW.raw_user_meta_data->>'parent_id', '')::uuid,
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

-- Promote admin@bartendaz.com if it exists (change email to match your admin account)
UPDATE public.profiles SET role = 'admin', status = 'approved'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@bartendaz.com');
