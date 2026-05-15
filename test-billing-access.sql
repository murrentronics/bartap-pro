-- Test 1: Check if billing_payments table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'billing_payments'
) as table_exists;

-- Test 2: Check if there are any payments
SELECT COUNT(*) as payment_count FROM billing_payments;

-- Test 3: Check RLS policies on billing_payments
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'billing_payments';

-- Test 4: Check if current user is admin
SELECT id, username, role FROM profiles WHERE id = auth.uid();
