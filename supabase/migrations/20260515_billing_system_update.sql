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
