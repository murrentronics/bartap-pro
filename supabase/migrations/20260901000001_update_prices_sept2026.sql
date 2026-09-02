-- ============================================================
-- Pricing update — September 2026
--
-- basic                  $1,800/yr
-- bar_only_addon         $1,200/yr
-- machines_only          $2,400/yr
-- machines_only_20       $3,600/yr
-- machines_bar_addon     $1,800/yr
-- machines_bar_addon_20  $2,400/yr
-- premium                $3,500/yr
-- premium_20             $4,000/yr
-- premium_addon          $3,000/yr
-- premium_addon_20       $3,400/yr
-- ============================================================

UPDATE public.billing_plans SET amount = 1800.00
WHERE plan_type = 'basic'                 AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 1200.00
WHERE plan_type = 'bar_only_addon'        AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 2400.00
WHERE plan_type = 'machines_only'         AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 3600.00
WHERE plan_type = 'machines_only_20'      AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 1800.00
WHERE plan_type = 'machines_bar_addon'    AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 2400.00
WHERE plan_type = 'machines_bar_addon_20' AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 3500.00
WHERE plan_type = 'premium'               AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 4000.00
WHERE plan_type = 'premium_20'            AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 3000.00
WHERE plan_type = 'premium_addon'         AND name NOT ILIKE '[Archived]%';

UPDATE public.billing_plans SET amount = 3400.00
WHERE plan_type = 'premium_addon_20'      AND name NOT ILIKE '[Archived]%';
