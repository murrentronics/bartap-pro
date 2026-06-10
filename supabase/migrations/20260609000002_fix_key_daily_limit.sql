-- Fix daily_limit to match actual Google Cloud free quota (100 search units/day)
-- The default of 9800 was wrong for new/unverified projects.
-- Run this to correct all existing slots.

ALTER TABLE public.youtube_api_keys
  ALTER COLUMN daily_limit SET DEFAULT 95;

UPDATE public.youtube_api_keys
  SET daily_limit = 95
  WHERE daily_limit = 9800;
