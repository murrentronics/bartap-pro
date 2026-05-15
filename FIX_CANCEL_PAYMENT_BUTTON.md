# Fix: Cancel Payment Button Not Working

## Problem
The "Cancel Payment" button shows a success toast but doesn't actually cancel the payment or update the UI.

## Root Cause
The `billing_payments` table is missing a **DELETE policy** in the Row Level Security (RLS) settings. Without this policy, users cannot delete their own pending payments, even though the frontend code tries to do so.

## Solution

### Step 1: Apply the Database Migration

You need to add a DELETE policy to the `billing_payments` table. Here's how:

#### Option A: Using Supabase Dashboard (Recommended)

1. Go to your **Supabase Dashboard**: https://supabase.com/dashboard
2. Select your **bartendaz-pro** project
3. Click on **"SQL Editor"** in the left sidebar
4. Click **"New Query"**
5. Copy and paste the following SQL:

```sql
-- Add DELETE policy for billing_payments
CREATE POLICY "Owners can delete their own pending payments"
  ON billing_payments FOR DELETE
  USING (
    owner_id = auth.uid() 
    AND status = 'pending'
  );
```

6. Click **"Run"** or press `Ctrl+Enter`
7. You should see: "Success. No rows returned"

#### Option B: Using the SQL File

1. Open the file: `APPLY_THIS_MIGRATION.sql`
2. Follow the instructions in that file

### Step 2: Verify the Fix

1. Go to your app
2. Create a test payment (it will be pending)
3. Click **"Cancel Payment"**
4. The payment should now be deleted and the UI should update to show the plan selection screen

## What This Policy Does

```sql
CREATE POLICY "Owners can delete their own pending payments"
  ON billing_payments FOR DELETE
  USING (
    owner_id = auth.uid()     -- Only the owner who created the payment
    AND status = 'pending'     -- Only pending payments (not paid/rejected)
  );
```

This policy allows:
- ✅ Owners to delete **their own** pending payments
- ✅ Only **pending** payments can be deleted (not paid or rejected ones)
- ❌ Users cannot delete other users' payments
- ❌ Users cannot delete already processed payments

## Frontend Changes Already Made

The frontend code in `src/pages/BillingPage.tsx` has been updated to:
- ✅ Wait for the delete operation to complete
- ✅ Refresh the payments list after deletion
- ✅ Reset all payment-related states
- ✅ Properly manage loading states

## Testing

After applying the migration, test the following scenarios:

1. **Cancel a pending payment** ✓
   - Create a payment
   - Click "Cancel Payment"
   - Payment should be deleted
   - UI should show plan selection

2. **Cannot cancel paid payment** ✓
   - Paid payments should not have a cancel button

3. **Cannot cancel another user's payment** ✓
   - Each user can only cancel their own payments

## Files Modified

- ✅ `src/pages/BillingPage.tsx` - Updated cancel payment logic
- ✅ `supabase/migrations/20260515_add_delete_payment_policy.sql` - New migration file
- ✅ `APPLY_THIS_MIGRATION.sql` - Easy-to-apply SQL file
- ✅ `FIX_CANCEL_PAYMENT_BUTTON.md` - This guide

## Need Help?

If the cancel button still doesn't work after applying the migration:

1. Check the browser console for errors (F12 → Console tab)
2. Verify the policy was created:
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'billing_payments' 
   AND policyname = 'Owners can delete their own pending payments';
   ```
3. Make sure you're logged in as the owner who created the payment
4. Try refreshing the page after applying the migration
