-- Drop the SECURITY DEFINER view that was created in migration 20260606000001.
-- It has been replaced by the get_youtube_daily_stats() SECURITY INVOKER function.
DROP VIEW IF EXISTS public.youtube_daily_stats;
