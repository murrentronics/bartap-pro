-- Reset all search quota counts so the new 75/day limit starts clean.
UPDATE public.youtube_search_quota
   SET count = 0,
       quota_date = CURRENT_DATE;
