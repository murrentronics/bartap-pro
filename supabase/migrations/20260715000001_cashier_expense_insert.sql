-- Allow cashiers to insert expenses into owner_expenses on behalf of their owner
CREATE POLICY "owner_expenses_cashier_insert" ON public.owner_expenses
  FOR INSERT WITH CHECK (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );

-- Allow cashiers to select their owner's expenses (for history display)
CREATE POLICY "owner_expenses_cashier_select" ON public.owner_expenses
  FOR SELECT USING (
    owner_id IN (
      SELECT parent_id FROM public.profiles
      WHERE id = auth.uid() AND role = 'cashier'
    )
  );

-- Allow cashiers to insert wallet_transactions for themselves (type = cashier_expense)
CREATE POLICY "wallet_transactions_cashier_insert" ON public.wallet_transactions
  FOR INSERT WITH CHECK (profile_id = auth.uid());

-- Allow owners to insert wallet_transactions for themselves
CREATE POLICY "wallet_transactions_owner_insert" ON public.wallet_transactions
  FOR INSERT WITH CHECK (profile_id = auth.uid());
