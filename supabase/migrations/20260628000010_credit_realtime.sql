-- Enable realtime for credit_accounts and credit_transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_transactions;
