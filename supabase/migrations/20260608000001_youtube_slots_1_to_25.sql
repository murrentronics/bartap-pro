-- Expand YouTube API key slots from 10 to 25 (26 total including slot 0 primary)

-- Widen the check constraint
ALTER TABLE public.youtube_api_keys
  DROP CONSTRAINT IF EXISTS youtube_api_keys_slot_check;

ALTER TABLE public.youtube_api_keys
  ADD CONSTRAINT youtube_api_keys_slot_check CHECK (slot BETWEEN 0 AND 25);

-- Insert slots 11–25 (disabled by default)
INSERT INTO public.youtube_api_keys (slot, label, enabled)
VALUES
  (11, 'YOUTUBE_API_KEY_11', false),
  (12, 'YOUTUBE_API_KEY_12', false),
  (13, 'YOUTUBE_API_KEY_13', false),
  (14, 'YOUTUBE_API_KEY_14', false),
  (15, 'YOUTUBE_API_KEY_15', false),
  (16, 'YOUTUBE_API_KEY_16', false),
  (17, 'YOUTUBE_API_KEY_17', false),
  (18, 'YOUTUBE_API_KEY_18', false),
  (19, 'YOUTUBE_API_KEY_19', false),
  (20, 'YOUTUBE_API_KEY_20', false),
  (21, 'YOUTUBE_API_KEY_21', false),
  (22, 'YOUTUBE_API_KEY_22', false),
  (23, 'YOUTUBE_API_KEY_23', false),
  (24, 'YOUTUBE_API_KEY_24', false),
  (25, 'YOUTUBE_API_KEY_25', false)
ON CONFLICT (slot) DO NOTHING;
