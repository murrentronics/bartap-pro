# Implementation Guide - Profile Management & Password Reset

## 🎯 What Was Fixed & Added

### 1. ✅ Fixed Forgot Password
**Problem**: Users were getting "user not found" errors even though they existed in the database.

**Root Cause**: The code was checking for email in the `profiles` table, but emails are stored in `auth.users`.

**Solution**: Removed the incorrect database lookup and now directly uses Supabase's built-in password reset functionality.

**User Flow**:
1. User clicks "Forgot password?" on login page
2. Enters their email address
3. Receives a 6-digit code via email
4. Enters the code to verify
5. Sets a new password
6. Redirected back to login

### 2. ✅ Added Profile Management Page
**Access**: Owners only (cashiers cannot access)

**Location**: Menu → Profile (above Logout button)

**Features**:

#### Business Information Section
- Edit business name (username)
- Update email address
- Email changes require confirmation via email link

#### Password Change Section
- Must enter current password first (for security)
- Enter new password twice
- Minimum 6 characters required
- Validates current password before allowing change

#### Danger Zone Section
- Delete account button (red/destructive styling)
- Confirmation dialog prevents accidental deletion
- Deletes ALL associated data:
  - All cashiers under the owner
  - All products
  - All orders
  - All wallet transactions
- Signs user out and redirects to login after deletion

### 3. ✅ Updated Navigation Menu
**Changes**:
- Added "Profile" button for owners only
- Profile appears above Logout button
- Added visual separator (border) between Profile and Logout
- Imported UserCircle icon for Profile button

### 4. ✅ Database Migration
**File**: `supabase/migrations/20240516_profile_management.sql`

**Function**: `public.delete_own_account()`

**Security Features**:
- Only owners can delete their own account
- Cashiers and admins cannot use this function
- Uses SECURITY DEFINER for proper permissions
- Requires authentication

**Cascade Behavior**:
When an owner deletes their account, the following is automatically deleted:
- All cashiers (via `parent_id` foreign key)
- All products (via `owner_id` foreign key)
- All orders (via `owner_id` and `cashier_id` foreign keys)
- All wallet transactions (via `profile_id` foreign key)

## 📋 How to Deploy

### Step 1: Apply Database Migration

#### Option A: Using Supabase CLI (Recommended)
```bash
cd supabase
supabase db push
```

#### Option B: Manual Application
1. Open your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the contents of `supabase/migrations/20240516_profile_management.sql`
4. Paste and execute

### Step 2: Verify Migration
Run this query in Supabase SQL Editor to verify the function exists:
```sql
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'delete_own_account';
```

You should see one row returned.

### Step 3: Test the Application
The frontend changes are already in place. Just refresh your app and test:

1. **Test Forgot Password**:
   - Go to login page
   - Click "Forgot password?"
   - Enter a valid owner email
   - Check email for 6-digit code
   - Enter code and set new password

2. **Test Profile Page** (as owner):
   - Login as an owner
   - Click Menu → Profile
   - Try updating business name
   - Try updating email (check for confirmation email)
   - Try changing password
   - (Optional) Test account deletion with a test account

3. **Verify Access Control**:
   - Login as a cashier
   - Verify Profile button does NOT appear in menu
   - Try navigating to `/profile` directly
   - Should be redirected away

## 🔒 Security Notes

1. **Password Verification**: Current password must be correct before allowing password change
2. **Email Confirmation**: Email changes require clicking a confirmation link
3. **Role-Based Access**: Only owners can access profile management
4. **Secure Deletion**: Account deletion requires explicit confirmation
5. **No Email Enumeration**: Forgot password doesn't reveal if email exists

## 🎨 UI/UX Features

1. **Loading States**: All buttons show loading spinner during operations
2. **Toast Notifications**: Clear success/error messages for all actions
3. **Validation**: Client-side validation before API calls
4. **Confirmation Dialogs**: Prevents accidental destructive actions
5. **Clear Sections**: Profile page organized into logical cards
6. **Danger Zone**: Account deletion clearly marked with red styling

## 📁 Files Modified

```
src/
├── pages/
│   ├── LoginPage.tsx          # Fixed forgot password
│   ├── ProfilePage.tsx         # NEW - Profile management
│   └── AppLayout.tsx           # Added Profile menu item
└── App.tsx                     # Added Profile route

supabase/
└── migrations/
    ├── 20240516_profile_management.sql      # NEW - Migration
    └── README_PROFILE_MANAGEMENT.md         # NEW - Documentation
```

## 🧪 Testing Checklist

### Forgot Password
- [ ] Valid email receives reset code
- [ ] Invalid email shows generic success (security)
- [ ] 6-digit code verification works
- [ ] New password is set successfully
- [ ] User can login with new password

### Profile Page - Business Info
- [ ] Business name updates successfully
- [ ] Email updates and sends confirmation
- [ ] Changes persist after page refresh
- [ ] Toast notifications appear

### Profile Page - Password Change
- [ ] Correct current password allows change
- [ ] Incorrect current password is rejected
- [ ] Password mismatch is caught
- [ ] Minimum length validation works
- [ ] User can login with new password

### Profile Page - Account Deletion
- [ ] Confirmation dialog appears
- [ ] Cancel button works
- [ ] Deletion removes all data
- [ ] User is signed out after deletion
- [ ] Cannot login with deleted account

### Access Control
- [ ] Owners see Profile button
- [ ] Cashiers don't see Profile button
- [ ] Cashiers redirected from /profile
- [ ] Admins don't see Profile button (they have separate admin panel)

## 🚨 Important Notes

1. **Backup Before Testing Deletion**: Account deletion is permanent and cannot be undone
2. **Test with Test Accounts**: Don't test deletion with real production accounts
3. **Email Configuration**: Ensure Supabase email templates are configured for password reset
4. **Migration Order**: Apply the migration before testing the frontend features

## 💡 Future Enhancements

Consider adding:
- Email notifications for account changes
- Two-factor authentication
- Account recovery grace period (soft delete)
- Export data before deletion
- Activity log of account changes
- Profile picture upload
- Business address and phone number fields
