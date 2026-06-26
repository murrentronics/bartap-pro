-- Update machines add-on plan price from 550 to 600
UPDATE billing_plans SET amount = 600 WHERE plan_type = 'machines_addon';
