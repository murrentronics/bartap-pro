-- profiles is already in supabase_realtime publication but likely lacks
-- REPLICA IDENTITY FULL, which means UPDATE payloads only carry changed
-- columns and the row-level filter (id=eq.<ownerId>) may not match.
-- Setting FULL ensures the complete row is included in every change event.

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
