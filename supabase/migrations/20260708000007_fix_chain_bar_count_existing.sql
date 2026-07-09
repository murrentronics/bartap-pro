-- Fix chain_bar_count for any owners already on the chain plan.
-- Their own profile IS bar 1, so count should be at least 1,
-- plus however many sub-accounts (is_bar_account = true) they have.

UPDATE public.profiles AS master
SET chain_bar_count = 1 + COALESCE((
  SELECT COUNT(*)
  FROM public.profiles sub
  WHERE sub.parent_id = master.id
    AND sub.is_bar_account = true
), 0)
WHERE master.plan_type = 'chain'
  AND master.chain_addon_active = true;
