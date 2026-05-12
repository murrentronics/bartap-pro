-- subscription_payments
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  due_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sub_pay_owner_idx ON public.subscription_payments(owner_id, due_date DESC);
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage subscription payments"
ON public.subscription_payments FOR ALL TO public
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Owners view own subscription payments"
ON public.subscription_payments FOR SELECT TO public
USING (owner_id = auth.uid());

-- template_images
CREATE TABLE IF NOT EXISTS public.template_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'beers',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS template_images_cat_idx ON public.template_images(category);
ALTER TABLE public.template_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed-in can view templates"
ON public.template_images FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins manage templates"
ON public.template_images FOR ALL TO public
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- decrement_stock_item: subtract qty per item id
CREATE OR REPLACE FUNCTION public.decrement_stock_item(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  it jsonb;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    UPDATE public.products
    SET stock_qty = GREATEST(0, stock_qty - COALESCE((it->>'qty')::int, 0))
    WHERE id = (it->>'id')::uuid;
  END LOOP;
END; $$;

-- owner_reset_wallet: zero out balance and log transaction
CREATE OR REPLACE FUNCTION public.owner_reset_wallet(_owner_id uuid, _prev_balance numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.profiles SET wallet_balance = 0 WHERE id = _owner_id;
  INSERT INTO public.wallet_transactions(profile_id, amount, type, note)
    VALUES (_owner_id, -_prev_balance, 'reset', 'Wallet reset by owner');
END; $$;