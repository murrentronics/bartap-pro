-- ─── Fix next_due_date calculation ───────────────────────────────────────────
-- Bug: next_due_date was calculated as due_date + duration_months.
-- But due_date is already set to today + duration_months when the payment is
-- created, so approval was doubling the duration (today + 24 months for annual).
--
-- Fix: calculate next_due_date from payment_date (when admin approves it)
-- plus the plan duration. That gives the correct renewal date.

CREATE OR REPLACE FUNCTION public.update_billing_on_payment_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_duration_months INTEGER;
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN

    SELECT duration_months INTO v_duration_months
    FROM public.billing_plans WHERE id = NEW.plan_id;

    -- next_due_date = approval date + plan duration (NOT due_date + duration)
    NEW.next_due_date := COALESCE(NEW.payment_date, now()) + (v_duration_months || ' months')::INTERVAL;

    UPDATE public.profiles
    SET
      billing_status          = 'active',
      music_addon             = true,
      current_plan_id         = NEW.plan_id,
      subscription_start_date = COALESCE(subscription_start_date, COALESCE(NEW.payment_date, now())),
      subscription_end_date   = NEW.next_due_date
    WHERE id = NEW.owner_id;

  END IF;

  RETURN NEW;
END;
$$;
