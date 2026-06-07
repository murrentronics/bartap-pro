-- Reset all exhausted slot flags and usage counts so the rotation system works again.
UPDATE public.youtube_api_keys
   SET exhausted   = false,
       used_today  = 0,
       reset_at    = now();

-- Also reset the per-user quota counts
UPDATE public.youtube_search_quota
   SET count      = 0,
       quota_date = CURRENT_DATE;
