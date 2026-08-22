-- Restore full manager wallet sales RPC with order item details
-- The 20260822000002 migration stripped it down to just wallet_transactions.
-- This restores the JOIN to orders so item descriptions show in the UI.

DROP FUNCTION IF EXISTS public.get_manager_wallet_sales(UUID);

CREATE OR REPLACE FUNCTION public.get_manager_wallet_sales(_manager_id UUID)
RETURNS TABLE (
  id UUID,
  amount NUMERIC,
  type TEXT,
  note TEXT,
  order_id UUID,
  created_at TIMESTAMPTZ,
  order_items JSONB,
  order_total NUMERIC,
  order_paid NUMERIC,
  order_change NUMERIC,
  order_payment_method TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    wt.id,
    wt.amount,
    wt.type,
    wt.note,
    wt.order_id,
    wt.created_at,
    o.items        AS order_items,
    o.total        AS order_total,
    o.paid         AS order_paid,
    o.change_given AS order_change,
    o.payment_method AS order_payment_method
  FROM public.wallet_transactions wt
  LEFT JOIN public.orders o ON o.id = wt.order_id
  WHERE wt.profile_id = _manager_id
    AND wt.type = 'sale'
  ORDER BY wt.created_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_manager_wallet_sales(UUID) TO authenticated;
