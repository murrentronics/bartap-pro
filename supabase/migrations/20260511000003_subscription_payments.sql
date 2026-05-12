-- Tracks annual subscription payments per owner
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Only admins can manage subscription payments
CREATE POLICY "Admin manage subscriptions" ON public.subscription_payments
  FOR ALL USING (public.is_admin(auth.uid()));

-- Owners can view their own
CREATE POLICY "Owner view own subscription" ON public.subscription_payments
  FOR SELECT USING (owner_id = auth.uid());
