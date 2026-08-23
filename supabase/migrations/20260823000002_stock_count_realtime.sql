-- Enable realtime for stock_count_tables so copied tables appear automatically

ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_count_tables;
