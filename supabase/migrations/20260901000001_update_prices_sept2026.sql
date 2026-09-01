-- ============================================================
-- Pricing update — September 2026
--
-- basic                  $1,800/yr  (was $1,200)
-- bar_only_addon         $1,200/yr  (was $800)
-- machines_only          $2,400/yr  (unchanged)
-- machines_only_20       $3,000/yr  (unchanged)
-- machines_bar_addon     $1,800/yr  (was $1,200)
-- machines_bar_addon_20  $2,400/yr  (was $1,500)
-- premium                $3,000/yr  (unchanged)
-- premium_20             $3,500/yr  (unchanged)
-- premium_addon          $2,500/yr  (was $2,000)
-- premium_addon_20       $3,000/yr  (was $2,500)
-- ============================================================

UPDATE public.billing_plans SET amount = 1800.00
WHERE plan_type = 'basic'                 AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 1200.00
WHERE plan_type = 'bar_only_addon'        AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 2400.00
WHERE plan_type = 'machines_only'         AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 3000.00
WHERE plan_type = 'machines_only_20'      AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 1800.00
WHERE plan_type = 'machines_bar_addon'    AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 2400.00
WHERE plan_type = 'machines_bar_addon_20' AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 2500.00
WHERE plan_type = 'premium_addon'         AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 3000.00
WHERE plan_type = 'premium_addon_20'      AND name NOT ILIKE '[Archived]%';
