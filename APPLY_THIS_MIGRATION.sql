-- ============================================================================
-- IMPORTANT: Apply this migration to fix the "Cancel Payment" button
-- ============================================================================
-- 
-- HOW TO APPLY:
-- 1. Go to your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project
-- 3. Go to "SQL Editor" in the left sidebar
-- 4. Click "New Query"
-- 5. Copy and paste this entire file
-- 6. Click "Run" or press Ctrl+Enter
-- 
-- This adds the missing DELETE policy so owners can cancel their pending payments
-- ============================================================================

-- Add DELETE policy for billing_payments so owners can cancel their own pending payments
CREATE POLICY "Owners can delete their own pending payments"
  ON billing_payments FOR DELETE
  USING (
    owner_id = auth.uid() 
    AND status = 'pending'
  );

-- Verify the policy was created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'billing_payments' 
  AND policyname = 'Owners can delete their own pending payments';

-- If you see a row returned above, the policy was successfully created! ✓
