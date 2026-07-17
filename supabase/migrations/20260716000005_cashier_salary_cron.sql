-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-process scheduled cashier salary payments
-- Runs every minute via pg_cron.
-- For each cashier_salaries row where next_pay_at <= now() and active = true:
--   1. Insert an owner_expenses record (Non-Stock Expense / Cashier Salary)
--   2. Advance next_pay_at to the next occurrence
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_cashier_salary_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              RECORD;
  v_cashier_name TEXT;
  v_today        DATE;
  v_next         TIMESTAMPTZ;
  v_tt_next      TIMESTAMPTZ;
BEGIN
  v_today := (now() AT TIME ZONE 'America/Port_of_Spain')::date;

  FOR r IN
    SELECT cs.*, p.username AS cashier_username
    FROM   public.cashier_salaries cs
    JOIN   public.profiles p ON p.id = cs.cashier_id
    WHERE  cs.active = true
    AND    cs.next_pay_at IS NOT NULL
    AND    cs.next_pay_at <= now()
  LOOP
    v_cashier_name := COALESCE(r.cashier_username, r.cashier_id::text);

    -- 1. Record the salary expense
    INSERT INTO public.owner_expenses (owner_id, amount, description, expense_date)
    VALUES (
      r.owner_id,
      r.amount,
      'Non-Stock Expense' || chr(10) ||
        'Cashier Salary: ' || v_cashier_name || ' = $' ||
        to_char(r.amount, 'FM999999990.00'),
      v_today
    );

    -- 2. Compute next occurrence
    v_next := NULL;
    IF r.frequency = 'daily' THEN
      v_next := r.next_pay_at + INTERVAL '1 day';
    ELSIF r.frequency = 'weekly' THEN
      v_next := r.next_pay_at + INTERVAL '7 days';
    ELSIF r.frequency = 'biweekly' THEN
      v_next := r.next_pay_at + INTERVAL '14 days';
    ELSIF r.frequency = 'monthly' THEN
      -- Same wall-clock time, one month later in Trinidad tz, capped at day 28
      v_tt_next := (r.next_pay_at AT TIME ZONE 'America/Port_of_Spain') + INTERVAL '1 month';
      v_tt_next := date_trunc('month', v_tt_next)
                   + (LEAST(COALESCE(r.pay_day, 1), 28) - 1) * INTERVAL '1 day'
                   + (v_tt_next::time);
      v_next := v_tt_next AT TIME ZONE 'America/Port_of_Spain';
    END IF;

    -- 3. Advance schedule
    UPDATE public.cashier_salaries
    SET    last_paid_at = now(),
           next_pay_at  = v_next
    WHERE  id = r.id;

  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_cashier_salary_payments() TO service_role;

-- ── Schedule: run every minute ───────────────────────────────────────────────
-- Safe unschedule — only removes if it already exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-cashier-salary-payments') THEN
    PERFORM cron.unschedule('process-cashier-salary-payments');
  END IF;
END;
$$;

SELECT cron.schedule(
  'process-cashier-salary-payments',
  '* * * * *',
  'SELECT public.process_cashier_salary_payments()'
);
