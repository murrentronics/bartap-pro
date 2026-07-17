-- Cashier salary configuration: stores the salary schedule per cashier
CREATE TABLE IF NOT EXISTS public.cashier_salaries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- null = pay-now only (no schedule), or one of the recurring values
  frequency     TEXT CHECK (frequency IN ('daily','weekly','biweekly','monthly')),
  -- For weekly/biweekly: day of week 0=Sun … 6=Sat
  -- For monthly: day of month 1–28
  pay_day       INTEGER,
  -- HH:MM time string for daily/weekly/biweekly scheduled payments
  pay_time      TEXT,
  -- The exact next datetime this salary should auto-fire (UTC)
  next_pay_at   TIMESTAMPTZ,
  -- Track last time it was paid (to prevent double-fire)
  last_paid_at  TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cashier_id)
);

ALTER TABLE public.cashier_salaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cashier_salaries_owner_select" ON public.cashier_salaries
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "cashier_salaries_owner_insert" ON public.cashier_salaries
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "cashier_salaries_owner_update" ON public.cashier_salaries
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "cashier_salaries_owner_delete" ON public.cashier_salaries
  FOR DELETE USING (owner_id = auth.uid());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.touch_cashier_salaries()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_touch_cashier_salaries
  BEFORE UPDATE ON public.cashier_salaries
  FOR EACH ROW EXECUTE FUNCTION public.touch_cashier_salaries();
