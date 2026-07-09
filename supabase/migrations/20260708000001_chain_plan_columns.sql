-- ============================================================
-- Chain of Bars Plan — Phase 1, Step 1 & 2
-- Adds chain plan columns to profiles table.
-- Safe: all columns are nullable/default false — zero impact
-- on existing owner, cashier, and admin profiles.
-- ============================================================

-- 1. Chain plan flag — true when this profile is the master chain owner
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS chain_addon_active boolean NOT NULL DEFAULT false;

-- 2. Number of bar sub-accounts this chain owner has created (0–10)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS chain_bar_count integer NOT NULL DEFAULT 0;

-- 3. Marks a profile as a bar sub-account under a chain owner
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_bar_account boolean NOT NULL DEFAULT false;

-- 4. Index on parent_id for efficient chain bar lookups
CREATE INDEX IF NOT EXISTS idx_profiles_parent_id ON profiles(parent_id);

-- Note: plan_type is a plain text column — no check constraint to modify.
-- Valid values ('basic', 'premium', 'chain') are enforced at application level.

COMMENT ON COLUMN profiles.chain_addon_active IS 'True when this owner has the Chain of Bars plan active';
COMMENT ON COLUMN profiles.chain_bar_count    IS 'Number of bar sub-accounts created (max 10)';
COMMENT ON COLUMN profiles.is_bar_account     IS 'True when this owner profile is a sub-account under a chain owner';
