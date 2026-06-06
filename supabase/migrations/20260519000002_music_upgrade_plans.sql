-- Music upgrade plans for existing subscribers
-- $150 for users on 6-month plan, $250 for users on annual plan
INSERT INTO public.billing_plans (name, amount, duration_months, currency)
VALUES
  ('Music Upgrade - 6 Month', 150.00, 6, 'TT'),
  ('Music Upgrade - Annual', 250.00, 12, 'TT')
ON CONFLICT DO NOTHING;
