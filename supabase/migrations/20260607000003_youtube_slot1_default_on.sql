-- Correct slot 1 label to match the secret name YOUTUBE_API_KEY_1.
-- Slot 0 (YOUTUBE_API_KEY primary) is handled in migration 20260607000004.
UPDATE public.youtube_api_keys
   SET label = 'YOUTUBE_API_KEY_1'
 WHERE slot = 1 AND label = 'Primary Key (Slot 1)';
