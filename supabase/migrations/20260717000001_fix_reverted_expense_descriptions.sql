-- Fix existing "Reverted Stock Expense" records that have the product name
-- joined directly to the title without a newline separator.
-- Old format: "Reverted Stock ExpenseHennessy ×58 reverted"
-- New format: "Reverted Stock Expense\nHennessy ×58 reverted"
UPDATE public.owner_expenses
SET description = regexp_replace(
  description,
  '^Reverted Stock Expense([^\n])',
  E'Reverted Stock Expense\n\\1'
)
WHERE description LIKE 'Reverted Stock Expense%'
  AND description NOT LIKE 'Reverted Stock Expense' || chr(10) || '%';
