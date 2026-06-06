-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: music upgrade approval must not overwrite subscription_end_date with
-- an earlier date. The base plan's end date is always authoritative.
--
-- Problem: when a music upgrade payment is approved, the trigger sets
-- subscription_end_date = music_upgrade.next_due_date (e.g. 6/5/2028)
-- even though the base plan's end date is 5/15/2030.
--
-- Fix: only update subscription_end_date if the new due date is LATER
-- than the existing one. This keeps the base plan date intact.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_billing_on_payment_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_duration_months INTEGER;
  v_is_music_upgrade BOOLEAN;
  v_existing_end_date TIMESTAMPTZ;
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN

    -- Calculate next_due_date from plan duration
    SELECT duration_months INTO v_duration_months
    FROM public.billing_plans WHERE id = NEW.plan_id;

    NEW.next_due_date := NEW.due_date + (v_duration_months || ' months')::INTERVAL;

    -- Is this a music upgrade/addon payment?
    SELECT name ILIKE '%music%' INTO v_is_music_upgrade
    FROM public.billing_plans WHERE id = NEW.plan_id;

    -- Get current subscription end date
    SELECT subscription_end_date INTO v_existing_end_date
    FROM public.profiles WHERE id = NEW.owner_id;

    UPDATE public.profiles
    SET
      billing_status          = 'active',
      current_plan_id         = NEW.plan_id,
      subscription_start_date = COALESCE(subscription_start_date, NEW.payment_date),
      -- For music upgrades: keep the LATER date (base plan's end date)
      -- For base plan payments: always set to the new due date
      subscription_end_date   = CASE
        WHEN v_is_music_upgrade AND v_existing_end_date IS NOT NULL
             AND v_existing_end_date > NEW.next_due_date
        THEN v_existing_end_date   -- keep base plan's later date
        ELSE NEW.next_due_date     -- use new due date (base plan payment)
      END
    WHERE id = NEW.owner_id;

  END IF;

  RETURN NEW;
END;
$$;
