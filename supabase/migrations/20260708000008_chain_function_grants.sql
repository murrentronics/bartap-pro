-- Grant execute on all chain RPC functions to authenticated users
-- Without these grants PostgREST won't expose them in the schema cache

GRANT EXECUTE ON FUNCTION public.get_chain_bars(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_bar_account(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_bar_account(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bar_account(uuid, uuid, text, text, boolean) TO authenticated;
