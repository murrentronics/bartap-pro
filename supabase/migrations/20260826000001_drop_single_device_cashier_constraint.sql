-- Remove the one-active-cashier-per-owner enforcement.
-- P.O.S. Pro allows cashiers to be logged in on multiple devices simultaneously.

DROP INDEX IF EXISTS public.uq_one_active_cashier_per_owner;
