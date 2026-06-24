-- Track which cashier is currently logged in (one active cashier per owner at a time).
-- is_active is flipped true on sign-in and false on sign-out via the app.
-- A partial unique index enforces the one-active-per-owner constraint at the DB level.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;

-- Only one cashier per owner can be active at the same time.
-- The index applies only to cashier rows where is_active = true.
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_cashier_per_owner
  ON public.profiles (parent_id)
  WHERE role = 'cashier' AND is_active = true;

-- Cashiers can update their own is_active flag (sign in / sign out).
-- The existing "Update own profile" policy already covers this since it uses id = auth.uid().
-- No additional policy needed.
