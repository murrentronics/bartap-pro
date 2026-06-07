-- Owner Financials: initial bar inventory cost + monthly expense tracking

-- Table to store the owner's financial settings (one row per owner)
CREATE TABLE IF NOT EXISTS public.owner_financials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  initial_expense   NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id)
);

-- Table to store monthly expense entries
CREATE TABLE IF NOT EXISTS public.owner_expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL,
  description    TEXT,
  expense_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.owner_financials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_expenses   ENABLE ROW LEVEL SECURITY;

-- owner_financials policies
CREATE POLICY "owner_financials_select" ON public.owner_financials
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "owner_financials_insert" ON public.owner_financials
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_financials_update" ON public.owner_financials
  FOR UPDATE USING (owner_id = auth.uid());

-- owner_expenses policies
CREATE POLICY "owner_expenses_select" ON public.owner_expenses
  FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "owner_expenses_insert" ON public.owner_expenses
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "owner_expenses_delete" ON public.owner_expenses
  FOR DELETE USING (owner_id = auth.uid());

-- Auto-update updated_at on owner_financials
CREATE OR REPLACE FUNCTION public.touch_owner_financials()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_touch_owner_financials
  BEFORE UPDATE ON public.owner_financials
  FOR EACH ROW EXECUTE FUNCTION public.touch_owner_financials();
