-- Reset all key slot counters and exhausted flags
-- Run this whenever keys need to be reset manually
UPDATE public.youtube_api_keys
SET used_today = 0,
    exhausted  = false,
    reset_at   = now()
WHERE true;
