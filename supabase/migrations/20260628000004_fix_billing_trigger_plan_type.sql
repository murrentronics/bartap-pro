-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: update_billing_on_payment_approval trigger was overwriting
-- subscription_end_date for ALL plan types, including machines_addon and
-- premium — causing basic plan renewal date to inherit the addon date.
--
-- Fix: only update subscription_end_date for the basic plan.
-- Premium and machines_addon have their own independent date columns.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_billing_on_payment_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_duration_months INTEGER;
  v_plan_type       TEXT;
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN

    SELECT duration_months, plan_type
      INTO v_duration_months, v_plan_type
    FROM public.billing_plans WHERE id = NEW.plan_id;

    -- next_due_date = approval date + plan duration
    NEW.next_due_date := COALESCE(NEW.payment_date, now()) + (v_duration_months || ' months')::INTERVAL;

    IF v_plan_type = 'basic' THEN
      -- Basic plan: update the main subscription dates only
      UPDATE public.profiles SET
        billing_status          = 'active',
        music_addon             = true,
        current_plan_id         = NEW.plan_id,
        plan_type               = 'basic',
        subscription_start_date = COALESCE(subscription_start_date, COALESCE(NEW.payment_date, now())),
        subscription_end_date   = NEW.next_due_date
      WHERE id = NEW.owner_id;

    ELSIF v_plan_type = 'premium' THEN
      -- Premium plan: update premium dates only, do NOT touch subscription_end_date
      UPDATE public.profiles SET
        status                           = 'approved',
        billing_status                   = 'active',
        music_addon                      = true,
        plan_type                        = 'premium',
        premium_subscription_start_date  = COALESCE(NEW.payment_date, now()),
        premium_subscription_end_date    = NEW.next_due_date
      WHERE id = NEW.owner_id;

    ELSIF v_plan_type = 'machines_addon' THEN
      -- Machines add-on: update addon dates only, do NOT touch subscription_end_date
      UPDATE public.profiles SET
        machines_addon_active     = true,
        machines_addon_start_date = COALESCE(NEW.payment_date, now()),
        machines_addon_end_date   = NEW.next_due_date
      WHERE id = NEW.owner_id;

    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- ─── One-time data fix ────────────────────────────────────────────────────────
-- For any basic-plan owner whose subscription_end_date was incorrectly
-- overwritten by an addon approval, restore it from their most recent PAID
-- basic-plan billing_payment's next_due_date.

UPDATE public.profiles p
SET subscription_end_date = (
  SELECT bp.next_due_date
  FROM public.billing_payments bp
  JOIN public.billing_plans pl ON pl.id = bp.plan_id
  WHERE bp.owner_id = p.id
    AND bp.status   = 'paid'
    AND pl.plan_type = 'basic'
  ORDER BY bp.approved_at DESC NULLS LAST
  LIMIT 1
)
WHERE p.role = 'owner'
  AND p.billing_status = 'active'
  AND EXISTS (
    -- Only fix owners who also have an addon that could have caused the overwrite
    SELECT 1 FROM public.profiles
    WHERE id = p.id AND machines_addon_active = true
  )
  AND EXISTS (
    SELECT 1
    FROM public.billing_payments bp
    JOIN public.billing_plans pl ON pl.id = bp.plan_id
    WHERE bp.owner_id = p.id
      AND bp.status    = 'paid'
      AND pl.plan_type = 'basic'
      AND bp.next_due_date IS NOT NULL
      -- Only fix if basic due date differs from current subscription_end_date
      AND bp.next_due_date != p.subscription_end_date
    ORDER BY bp.approved_at DESC NULLS LAST
    LIMIT 1
  );
