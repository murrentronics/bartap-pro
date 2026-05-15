-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view billing plans" ON billing_plans;
DROP POLICY IF EXISTS "Owners can view their own payments" ON billing_payments;
DROP POLICY IF EXISTS "Owners can create their own payments" ON billing_payments;
DROP POLICY IF EXISTS "Admins can update payments" ON billing_payments;
DROP POLICY IF EXISTS "Owners can view active bank details" ON admin_bank_details;
DROP POLICY IF EXISTS "Admins can manage their bank details" ON admin_bank_details;

-- Update the overdue payment function to set status to pending instead of suspended
CREATE OR REPLACE FUNCTION check_overdue_payments()
RETURNS void AS $$
BEGIN
  -- Set owners to pending whose subscription has expired and no pending payment
  UPDATE profiles
  SET status = 'pending'
  WHERE role = 'owner'
    AND billing_status = 'active'
    AND subscription_end_date < NOW()
    AND status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM billing_payments 
      WHERE owner_id = profiles.id 
      AND status = 'pending'
    );
    
  -- Update billing status to expired
  UPDATE profiles
  SET billing_status = 'expired'
  WHERE role = 'owner'
    AND billing_status = 'active'
    AND subscription_end_date < NOW();
END;
$$ LANGUAGE plpgsql;

-- Recreate RLS Policies
CREATE POLICY "Anyone can view billing plans"
  ON billing_plans FOR SELECT
  USING (true);

CREATE POLICY "Owners can view their own payments"
  ON billing_payments FOR SELECT
  USING (
    owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Owners can create their own payments"
  ON billing_payments FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins can update payments"
  ON billing_payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Owners can view active bank details"
  ON admin_bank_details FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage their bank details"
  ON admin_bank_details FOR ALL
  USING (admin_id = auth.uid() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
