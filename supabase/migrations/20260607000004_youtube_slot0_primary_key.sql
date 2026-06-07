-- Add slot 0 for the primary YOUTUBE_API_KEY (simple single-key mode).
-- This is the key already in use — shown first in the admin panel, enabled by default.

-- Expand the slot check constraint to allow 0
ALTER TABLE public.youtube_api_keys
  DROP CONSTRAINT IF EXISTS youtube_api_keys_slot_check;

ALTER TABLE public.youtube_api_keys
  ADD CONSTRAINT youtube_api_keys_slot_check CHECK (slot BETWEEN 0 AND 10);

-- Insert slot 0 as the primary key entry
INSERT INTO public.youtube_api_keys (slot, label, enabled)
VALUES (0, 'YOUTUBE_API_KEY (Primary)', true)
ON CONFLICT (slot) DO NOTHING;
