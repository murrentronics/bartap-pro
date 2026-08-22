-- Revert manager wallet sales to simple version that works

DROP FUNCTION IF EXISTS public.get_manager_wallet_sales(UUID);

CREATE OR REPLACE FUNCTION public.get_manager_wallet_sales(_manager_id UUID)
RETURNS TABLE (
  id UUID,
  amount NUMERIC,
  type TEXT,
  note TEXT,
  order_id UUID,
  created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT 
    wt.id,
    wt.amount,
    wt.type,
    wt.note,
    wt.order_id,
    wt.created_at
  FROM public.wallet_transactions wt
  WHERE wt.profile_id = _manager_id
    AND wt.type = 'sale'
  ORDER BY wt.created_at DESC
  LIMIT 100;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_manager_wallet_sales(UUID) TO authenticated;
