-- Add music addon flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS music_addon BOOLEAN DEFAULT false;

-- Insert music addon billing plans
INSERT INTO public.billing_plans (name, amount, duration_months, currency)
VALUES
  ('Music Addon - Annual', 750.00, 12, 'TT'),
  ('Music Addon - 6 Month', 450.00, 6, 'TT')
ON CONFLICT DO NOTHING;
