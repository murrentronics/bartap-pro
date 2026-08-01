-- ─── time_cards: employee clock-in / clock-out records ───────────────────────
-- Each row is one work period for a staff member.
-- clocked_in_at / clocked_out_at are stored as UTC; the UI displays them in
-- Trinidad time (America/Port_of_Spain, UTC-4).

CREATE TABLE IF NOT EXISTS public.time_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_name    TEXT NOT NULL,
  clocked_in_at    TIMESTAMPTZ NOT NULL,
  clocked_out_at   TIMESTAMPTZ,
  work_date        DATE NOT NULL,          -- Trinidad calendar date of clock-in
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.time_cards ENABLE ROW LEVEL SECURITY;

-- Owner can read all time cards for their bar
CREATE POLICY "time_cards_owner_select" ON public.time_cards
  FOR SELECT USING (owner_id = public.get_owner_id(auth.uid()));

-- Owner or the employee themselves can insert
CREATE POLICY "time_cards_insert" ON public.time_cards
  FOR INSERT WITH CHECK (owner_id = public.get_owner_id(auth.uid()));

-- Owner or the employee can update (to stamp clock-out)
CREATE POLICY "time_cards_update" ON public.time_cards
  FOR UPDATE USING (owner_id = public.get_owner_id(auth.uid()));

-- Owner can delete
CREATE POLICY "time_cards_owner_delete" ON public.time_cards
  FOR DELETE USING (owner_id = public.get_owner_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_time_cards_owner ON public.time_cards(owner_id);
CREATE INDEX IF NOT EXISTS idx_time_cards_employee ON public.time_cards(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_cards_work_date ON public.time_cards(owner_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_time_cards_open ON public.time_cards(employee_id) WHERE clocked_out_at IS NULL;
