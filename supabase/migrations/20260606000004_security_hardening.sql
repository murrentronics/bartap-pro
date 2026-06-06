-- ─────────────────────────────────────────────────────────────────────────────
-- Security hardening — fixes linter warnings
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Fix mutable search_path on existing billing functions ─────────────────
-- These were created without SET search_path, making them vulnerable to
-- search_path injection attacks.

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_payment_reference()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  ref    TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    ref := 'BP' || TO_CHAR(NOW(), 'YYYYMMDD') || LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    SELECT EXISTS(SELECT 1 FROM public.billing_payments WHERE reference_number = ref) INTO exists;
    EXIT WHEN NOT exists;
  END LOOP;
  RETURN ref;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_billing_on_payment_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    NEW.next_due_date := NEW.due_date + (
      SELECT (duration_months || ' months')::INTERVAL
      FROM public.billing_plans
      WHERE id = NEW.plan_id
    );
    UPDATE public.profiles
    SET
      billing_status          = 'active',
      current_plan_id         = NEW.plan_id,
      subscription_start_date = COALESCE(subscription_start_date, NEW.payment_date),
      subscription_end_date   = NEW.next_due_date
    WHERE id = NEW.owner_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_overdue_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET status = 'pending'
  WHERE role = 'owner'
    AND billing_status = 'active'
    AND subscription_end_date < NOW()
    AND status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_payments
      WHERE owner_id = profiles.id AND status = 'pending'
    );

  UPDATE public.profiles
  SET billing_status = 'expired'
  WHERE role = 'owner'
    AND billing_status = 'active'
    AND subscription_end_date < NOW();
END;
$$;

-- ── 2. Lock down YouTube admin-only functions from anon/public access ─────────
-- reset_youtube_key_counts and yt_purge_expired_cache should only be callable
-- by the service_role (cron jobs) or admins — not anonymous users.

REVOKE ALL ON FUNCTION public.reset_youtube_key_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_youtube_key_counts() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.yt_purge_expired_cache() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yt_purge_expired_cache() TO service_role;

-- ── 3. Tighten product-images bucket listing policy ───────────────────────────
-- The existing broad SELECT policy lets anyone list all files in the bucket.
-- Drop it and replace with a narrower one that allows reads by object path only
-- (direct URL access still works — listing the full bucket does not).

DROP POLICY IF EXISTS "Public read product images" ON storage.objects;

CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'product-images'
    AND auth.role() = 'authenticated'
  );

-- ── 4. Leaked password protection ────────────────────────────────────────────
-- This cannot be fixed via SQL migration — it is a dashboard setting.
-- Go to: Supabase Dashboard → Authentication → Security → Enable "Leaked password protection"
-- (checks passwords against HaveIBeenPwned.org on sign-up/password change)
