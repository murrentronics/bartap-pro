-- Step 1: See the ACTUAL live function body
SELECT prosrc
FROM pg_proc
WHERE proname = 'handle_order_insert'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
