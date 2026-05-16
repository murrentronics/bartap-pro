# Profile Management Migration

## Overview
This migration adds profile management functionality including the ability for owners to delete their own accounts.

## Migration File
- `20240516_profile_management.sql`

## What's Included

### 1. Account Deletion Function
- **Function**: `public.delete_own_account()`
- **Purpose**: Allows owners to permanently delete their own account and all associated data
- **Security**: 
  - Only owners can delete their own account (not cashiers or admins)
  - Uses SECURITY DEFINER to ensure proper permissions
  - Authenticated users only

### 2. Cascade Deletion
When an owner deletes their account, the following data is automatically deleted due to existing CASCADE constraints:
- All cashiers under that owner (via `parent_id` reference)
- All products owned by that owner (via `owner_id` reference)
- All orders created by the owner or their cashiers (via `owner_id` and `cashier_id` references)
- All wallet transactions for the owner and their cashiers (via `profile_id` reference)

## How to Apply

### Option 1: Using Supabase CLI
```bash
supabase db push
```

### Option 2: Manual Application
1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste the contents of `20240516_profile_management.sql`
4. Execute the SQL

## Testing

After applying the migration, you can test the function:

```sql
-- As an authenticated owner, call:
SELECT public.delete_own_account();
```

**Warning**: This will permanently delete the account and all associated data!

## Frontend Integration

The Profile page (`src/pages/ProfilePage.tsx`) uses this function in the "Danger Zone" section:

```typescript
const { error } = await supabase.rpc("delete_own_account");
```

## Rollback

To rollback this migration:

```sql
DROP FUNCTION IF EXISTS public.delete_own_account();
```

## Notes
- This is a destructive operation and cannot be undone
- Users are warned with a confirmation dialog before deletion
- The function validates that only owners can delete their accounts
- Cashiers must be deleted by their owner, not themselves
- Admins cannot use this function (they should be managed separately)
