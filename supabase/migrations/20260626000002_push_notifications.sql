-- ─────────────────────────────────────────────────────────────────────────────
-- Push notification infrastructure
--   device_tokens  — stores FCM tokens per owner profile
--   machine_alert_settings — owner's payout alert threshold per owner
-- ─────────────────────────────────────────────────────────────────────────────

-- FCM device tokens (one per device per owner)
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'android',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, token)
);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own tokens"
  ON public.device_tokens FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Machine payout alert settings per owner
CREATE TABLE IF NOT EXISTS public.machine_alert_settings (
  owner_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  threshold   NUMERIC NOT NULL DEFAULT 1000,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.machine_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage own alert settings"
  ON public.machine_alert_settings FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_device_tokens_owner ON public.device_tokens(owner_id);
