-- Fix RLS policy for admin to view all billing payments
DROP POLICY IF EXISTS "Owners can view their own payments" ON billing_payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON billing_payments;

-- Recreate with separate policies for owners and admins
CREATE POLICY "Owners can view their own payments"
  ON billing_payments FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Admins can view all payments"
  ON billing_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );
