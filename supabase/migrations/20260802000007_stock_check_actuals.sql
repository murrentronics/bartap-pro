-- Stock Check Actuals
-- Stores the "actual" count per product per owner, used by the Stock Check page
-- to track physical inventory vs system qty and calculate loss.

create table if not exists stock_check_actuals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references profiles(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  actual_qty    integer not null default 0,
  updated_at    timestamptz not null default now(),
  unique (owner_id, product_id)
);

-- RLS
alter table stock_check_actuals enable row level security;

-- Owner can read/write their own actuals
create policy "owner_read_actuals" on stock_check_actuals
  for select using (auth.uid() = owner_id);

create policy "owner_write_actuals" on stock_check_actuals
  for all using (auth.uid() = owner_id);

-- Manager can read/write actuals belonging to their parent owner
create policy "manager_read_actuals" on stock_check_actuals
  for select using (
    exists (
      select 1 from profiles m
      where m.id = auth.uid()
        and (m.role = 'manager' or m.job_title = 'manager')
        and m.parent_id = stock_check_actuals.owner_id
    )
  );

create policy "manager_write_actuals" on stock_check_actuals
  for all using (
    exists (
      select 1 from profiles m
      where m.id = auth.uid()
        and (m.role = 'manager' or m.job_title = 'manager')
        and m.parent_id = stock_check_actuals.owner_id
    )
  );

-- Realtime
alter publication supabase_realtime add table stock_check_actuals;
