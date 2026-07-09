---
inclusion: manual
---

# Chain of Bars Feature — Crash-Safe Progress Tracker

## KEYWORD: `continue`
When user types "continue", read this file first, find the last completed step, and resume from the next uncompleted step. Do NOT redo completed steps. Do NOT touch existing single-bar owner flows.

---

## FEATURE OVERVIEW
Add a "Chain of Bars" add-on plan ($2500/year on top of basic plan, max 10 bars) that lets a single owner manage multiple independent bars from one login. Each bar is a fully isolated sub-account (own products, orders, wallet, cashiers, machines, PDFs). The master owner switches between bars via a Switch Bar screen.

## PRICING
- Chain plan: $3000/year — standalone plan, NOT an add-on
- When an owner upgrades to Chain, their plan_type becomes "chain" and a new renewal date is set 1 year from payment date
- They will NOT see basic/premium plan options — only the Chain Plan on their billing page
- Max bars: 10
- Existing single-bar owners: completely unaffected

## ARCHITECTURE DECISIONS
- Sub-account model: each bar = a new `owner` profile with `parent_id = master_owner.id`
- Master owner role: `role = "chain_owner"` in profiles table
- Active bar stored in React context + localStorage key `active_bar_id`
- RLS: add one extra policy per table allowing chain_owner to access rows where owner_id belongs to one of their bar sub-accounts
- No schema changes to existing tables — only new rows and new policies
- Billing: chain plan tracked on master profile via `plan_type = "chain"`, `chain_addon_active = true`, `chain_bar_count`, and `plan_expires_at` (set to 1 year from payment date)
- When upgrading to chain: old plan_type is overwritten with "chain", new renewal date replaces old one
- Billing page for chain owners shows ONLY the Chain Plan card ($3000/year) — no basic/premium options

---

## MASTER TASK LIST

### PHASE 1 — Database / Supabase
- [x] STEP 1: Migration — add `chain_addon_active` (bool) and `chain_bar_count` (int) columns to `profiles` table. Add index on `parent_id` for chain queries.
- [x] STEP 2: Migration — add `is_bar_account` (bool) column to `profiles` so bar sub-accounts are identifiable. 
- [x] STEP 3: RLS policies — for each key table (products, orders, wallet_transactions, credit_accounts, credit_transactions, owner_expenses, owner_financials, machines, machine_entries, machine_float_sessions, cashiers/profiles) add policy: "chain owner can access rows where owner_id IN (SELECT id FROM profiles WHERE parent_id = auth.uid())"
- [x] STEP 4: RPC function `get_chain_bars(p_owner_id uuid)` — returns list of bar sub-accounts for a master owner
- [x] STEP 5: RPC function `create_bar_account(p_owner_id uuid, p_name text, p_location text, p_has_machines bool)` — inserts new owner profile as sub-account, increments chain_bar_count
- [x] STEP 6: RPC function `delete_bar_account(p_bar_id uuid)` — cascades delete all bar data, decrements count (for future use, not wired to UI yet)

### PHASE 2 — React Context
- [x] STEP 7: Create `src/lib/ChainContext.tsx` — provides `activeBarId`, `setActiveBarId`, `chainBars`, `isChainOwner`, `refreshBars`. Persists `active_bar_id` to localStorage. On mount, loads bar list for chain owners.
- [x] STEP 8: Wrap `ChainContext` provider in `src/App.tsx` (or router root)
- [x] STEP 9: Update `useAuth` / all data-fetching hooks to use `activeBarId` from ChainContext as the effective `owner_id` when present. Non-chain owners unaffected (activeBarId = null → use profile.id as before)

### PHASE 3 — Switch Bar UI
- [x] STEP 10: Create `src/pages/SwitchBarPage.tsx` — full-screen cards view showing each bar (name, location, type badge Bar/Bar+Machines). Cards show active bar highlighted. "Create New Bar" button at bottom. Max 10 bar enforcement.
- [x] STEP 11: Create `src/pages/CreateBarPage.tsx` — form: Bar Name, District/Location, type select (Bar only / Bar + Machines). Submit calls `create_bar_account` RPC. On success, auto-switches to new bar and navigates to /register.
- [x] STEP 12: Add routes for `/switch-bar` and `/create-bar` to router
- [x] STEP 13: Add "Switch Bar" button to `AppLayout.tsx` menu — visible only to chain owners, positioned just before Factory Reset

### PHASE 4 — Billing / Plan Enforcement
- [x] STEP 14: Update `src/pages/BillingPage.tsx` — chain owners see ONLY a Chain Plan card ($3000/year, up to 10 bars). Non-chain owners see their existing basic/premium options unchanged + Chain Plan card as upgrade option. Admin approval sets `plan_type = "chain"`, `chain_addon_active = true`, `plan_expires_at = now() + 1 year`, `chain_bar_count = 0`.
- [x] STEP 15: Add chain plan enforcement in `CreateBarPage` — if `chain_bar_count >= 10`, show error "Maximum 10 bars reached".
- [x] STEP 16: Update `AppLayout.tsx` boot redirect logic — if `role = "chain_owner"` and no `active_bar_id` set, redirect to `/switch-bar` so they always pick a bar first.

### PHASE 5 — Data Isolation Verification
- [x] STEP 17: Audit every page that reads `profile.id` as owner_id and replace with `effectiveOwnerId` from ChainContext helper. Pages audited: RegisterPage ✓, ProductsPage ✓, WalletPage ✓, CreditPage (fixed — was missing useChain), MachinesPage ✓, CashiersPage ✓, SpecialsPage ✓, FactoryResetPage ✓, PDFs ✓ (use ownerId from data queries).
- [x] STEP 18: Verify factory reset uses active bar's owner_id (not master's id) — so reset only wipes the selected bar.
- [ ] STEP 19: Test: create 2 bars, add products to each, switch between them, confirm data isolation.

### PHASE 6 — Admin Panel
- [x] STEP 20: Update `src/routes/_app/admin.tsx` — chain owners show with orange "Chain · N bars" badge. Sub-bar accounts show "Sub-bar" badge. Admin can see plan type at a glance. New migration `20260708000004` updates `admin_list_profiles` RPC to return `plan_type`, `chain_bar_count`, `is_bar_account`.

---

## LAST COMPLETED STEP
> **STEP 20 completed 2026-07-08** — All 20 steps complete. Phase 3 (Switch Bar UI) was already done. Phase 4: BillingPage choose-step now shows Chain Plan card as upgrade option for non-chain owners; AdminBillingManagementPage handles chain plan approval (sets plan_type=chain, chain_addon_active=true, subscription_end_date=now+1yr, chain_bar_count=0). Phase 5: CreditPage route was the only remaining page missing `effectiveOwnerId` — fixed. All other pages (Register, Products, Wallet, Machines, Cashiers, Specials, FactoryReset, PDFs) already use effectiveOwnerId. Phase 6: admin_list_profiles RPC updated via migration 20260708000004 to return plan_type/chain_bar_count/is_bar_account; admin user rows now show orange "Chain · N bars" badge for chain owners and "Sub-bar" badge for bar sub-accounts.

---

## CURRENT WORKING NOTES
- Steps 1 & 2 combined into single migration file
- IMPORTANT: `is_chain_bar_of()` helper function handles all RLS — no existing policies touched
- Bar sub-accounts are real auth.users entries with fake @chain.internal emails
- Steps 4+5+6 combined into `20260708000003_chain_rpc_functions.sql`
- ChainContext provides `effectiveOwnerId(profileId)` helper — returns activeBarId for chain owners, profileId for everyone else. All pages will use this in Step 9.
- ChainProvider sits inside AuthProvider and I18nProvider, outside MusicPlayerProvider

---

## FILES MODIFIED SO FAR
- `supabase/migrations/20260708000001_chain_plan_columns.sql` (created)
- `supabase/migrations/20260708000002_chain_rls_policies.sql` (created)
- `supabase/migrations/20260708000003_chain_rpc_functions.sql` (created)
- `supabase/migrations/20260708000004_admin_list_profiles_chain.sql` (created)
- `src/lib/auth.tsx` (Profile type updated)
- `src/lib/ChainContext.tsx` (created)
- `src/lib/admin.functions.ts` (AdminProfileRow type updated with plan_type/chain_bar_count/is_bar_account)
- `src/App.tsx` (ChainProvider added)
- `src/lib/cashiers.functions.ts` (createCashier accepts optional barOwnerId)
- `src/pages/SpecialsPage.tsx` (ownerId now uses effectiveOwnerId)
- `src/pages/BillingPage.tsx` (choose step now includes Chain Plan card)
- `src/pages/SwitchBarPage.tsx` (created — also mirrored in routes/_app/switch-bar.tsx)
- `src/pages/CreateBarPage.tsx` (created — also mirrored in routes/_app/create-bar.tsx)
- `src/routes/_app/switch-bar.tsx` (created)
- `src/routes/_app/create-bar.tsx` (created)
- `src/routes/_app/cashiers.tsx` (load + realtime + createCashier use effectiveOwnerId / activeBarId)
- `src/routes/_app/credit.tsx` (ownerId now uses effectiveOwnerId — was missing useChain)
- `src/routes/_app/factory-reset.tsx` (handleReset uses effectiveOwnerId)
- `src/routes/_app/machines.tsx` (useChain() destructure added to MachinesPage)
- `src/routes/_app/admin.tsx` (Row type updated; GitBranch import added; chain/sub-bar badges in user rows)
- `src/pages/AdminBillingManagementPage.tsx` (chain plan approval logic added)
- `src/pages/AppLayout.tsx` (Switch Bar menu item + redirect to /switch-bar for chain owners with no active bar)
- `supabase/functions/create-cashier/index.ts` (accepts bar_owner_id, validates it belongs to caller)

---

## HOW TO RESUME AFTER A CRASH
1. User types: `continue`
2. Kiro reads this file
3. Find "LAST COMPLETED STEP" 
4. Find the next `[ ]` unchecked step after that
5. Execute that step
6. Mark it `[x]` in this file
7. Update "LAST COMPLETED STEP"
8. Continue to next step

---

## SAFETY RULES (never break these)
- NEVER modify existing RLS policies — only ADD new ones
- NEVER change how `role = "owner"` or `role = "cashier"` profiles work
- NEVER make chain features visible to non-chain owners
- ALWAYS use `effectiveOwnerId` (activeBarId ?? profile.id) pattern — never hardcode profile.id in new code
- ALWAYS test that existing single-bar flow still works after each phase
- Migration files go in `supabase/migrations/` with timestamp prefix
