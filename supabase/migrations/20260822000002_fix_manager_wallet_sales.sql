-- Fix manager wallet sales: drop and recreate with order details

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
    o.items,
    o.total,
    o.paid,
    o.change_given,
    o.payment_method
  FROM public.wallet_transactions wt
  LEFT JOIN public.orders o ON o.id = wt.order_id
  WHERE wt.profile_id = _manager_id
    AND wt.type = 'sale'
  ORDER BY wt.created_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_manager_wallet_sales(UUID) TO authenticated;
