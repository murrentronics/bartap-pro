-- Update plan prices
-- Basic: 800, Premium: 1300, Machines addon: 550 (unchanged)
UPDATE billing_plans SET amount = 800  WHERE plan_type = 'basic';
UPDATE billing_plans SET amount = 1300 WHERE plan_type = 'premium';
