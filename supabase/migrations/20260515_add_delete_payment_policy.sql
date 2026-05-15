-- Add DELETE policy for billing_payments so owners can cancel their own pending payments
CREATE POLICY "Owners can delete their own pending payments"
  ON billing_payments FOR DELETE
  USING (
    owner_id = auth.uid() 
    AND status = 'pending'
  );
