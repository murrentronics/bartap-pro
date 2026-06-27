-- Allow admins to delete any billing_payment record
CREATE POLICY "Admins can delete payments"
  ON public.billing_payments FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── RPC: admin_revoke_subscription ───────────────────────────────────────────
-- Called by admin when deleting an approved (paid) billing payment.
-- Resets the owner's profile back to pending so they must re-subscribe.
-- Also deletes the payment record itself.
CREATE OR REPLACE FUNCTION public.admin_revoke_subscription(
  p_payment_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id  UUID;
  v_plan_type TEXT;
BEGIN
  -- Caller must be admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Fetch the payment + plan type
  SELECT bp.owner_id, pl.plan_type
    INTO v_owner_id, v_plan_type
    FROM public.billing_payments bp
    JOIN public.billing_plans pl ON pl.id = bp.plan_id
   WHERE bp.id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  -- Reset profile based on what plan is being revoked
  IF v_plan_type = 'basic' THEN
    -- Full reset — back to pending, no subscription
    UPDATE public.profiles SET
      status                    = 'pending',
      billing_status            = 'pending_setup',
      plan_type                 = 'basic',
      subscription_start_date   = NULL,
      subscription_end_date     = NULL,
      music_addon               = false
    WHERE id = v_owner_id;

  ELSIF v_plan_type = 'premium' THEN
    -- Downgrade premium back to basic
    UPDATE public.profiles SET
      plan_type                         = 'basic',
      premium_subscription_start_date   = NULL,
      premium_subscription_end_date     = NULL,
      music_addon                       = false
    WHERE id = v_owner_id;

  ELSIF v_plan_type = 'machines_addon' THEN
    -- Deactivate machines add-on
    UPDATE public.profiles SET
      machines_addon_active     = false,
      machines_addon_start_date = NULL,
      machines_addon_end_date   = NULL
    WHERE id = v_owner_id;
  END IF;

  -- Delete the payment record
  DELETE FROM public.billing_payments WHERE id = p_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_subscription(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_subscription(UUID) TO authenticated;
