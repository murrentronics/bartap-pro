# P.O.S. Pro — Restructure Plan

## What this project is
This codebase started as a copy of **Bartendaz Pro** (`bartap-pro`).
The goal is to transform it into a **brand new standalone app called P.O.S. Pro**.

P.O.S. Pro is the **bar/POS-only version** of Bartendaz Pro — all the slot/gaming machine
tracking features are removed. It is a full point-of-sale and bar management app.

## App identity
- **App name:** P.O.S. Pro
- **Subtitle / description:** The bar owner's business name (pulled from `profile.username`
  or a dedicated `business_name` field) displayed beneath the app name in the header and splash screen.
- **Old branding to replace everywhere:** "Bartendaz Pro" → "P.O.S. Pro"
  Files to check: `src/pages/AppLayout.tsx`, `src/components/SplashScreen.tsx`,
  `index.html`, `public/manifest.json`, `android/app/src/main/AndroidManifest.xml`,
  `package.json`, `capacitor.config.ts`

## What to REMOVE (machines-related)
- `src/pages/MachinesPage.tsx` — delete the file
- `src/pages/FactoryResetPage.tsx` — delete the file (machines factory reset)
- `src/lib/machineAlerts.ts` (or `.tsx`) — delete
- Route `/machines` and `/factory-reset` in `src/App.tsx`
- Import of `MachinesPage` and `FactoryResetPage` in `src/App.tsx`
- `machines` nav item in `src/pages/AppLayout.tsx`
- All `ownerHasMachines`, `isMachinesOnlyUser`, `ownerHasBar` state + logic in `src/pages/AppLayout.tsx`
- `machines_only` and `machines_only_20` plan_type handling everywhere
- `is_machines_account`, `machines_addon_active`, `machines_addon_start_date`,
  `machines_addon_end_date` fields from the `Profile` type in `src/lib/auth.tsx`
- Any machines-related redirect logic in `AppLayout.tsx`
  (e.g. `if plan_type === "machines_only" → nav("/machines")`)
- The payout alert modal and its sound effect in `AppLayout.tsx`
  (the `payoutAlert` state, the `payoutAlert` CustomEvent listener, and the modal JSX)
- `Gamepad2` icon import (used only for machines nav item)
- `src/routes/_app/machines.tsx` if it exists as a TanStack route file

## What to KEEP (everything bar/POS related)
- `/register` — cashier POS / order taking screen
- `/products` — product management
- `/wallet` — wallet / sales summary
- `/cashiers` — cashier management
- `/billing` — subscription billing
- `/profile` — owner profile
- `/music` — music player
- `/credit` — credit management
- `/language` — language settings
- `/specials` — specials/promotions
- `/switch-bar` — multi-bar / chain switching
- `/summary` — sales summary
- `/manager` — manager dashboard
- `/stock-check` — stock management
- `/manual` — app manual
- `/admin`, `/admin/banking`, `/admin/billing` — admin panel
- `/privacy`, `/terms` — legal pages
- All auth, offline, i18n, chain/multi-bar, music player, YouTube, push notification logic

## Plan types to KEEP in P.O.S. Pro
- `basic`, `premium`, `premium_20`, `chain`
- Multi-bar addon (addon_bar_count, is_multi_bar, is_bar_account)
- Chain of Bars (chain_addon_active, chain_bar_count)

## Dynamic business name subtitle
In the app header (AppLayout.tsx) and SplashScreen, show the owner's business name
as a subtitle below "P.O.S. Pro". Use `profile.username` as the value for now
(can be swapped for a dedicated `business_name` column later).
The header should read:
  P.O.S. Pro          ← app name (bold/large)
  [Business Name]     ← small muted subtitle, e.g. "The Rusty Anchor Bar"

## Trigger phrase
When the user types **"start the P.O.S. Pro restructure"**, begin executing
the removal + rebranding steps listed above immediately, in this order:
1. Rebrand all app name references from "Bartendaz Pro" to "P.O.S. Pro"
2. Add the dynamic business name subtitle to the header
3. Remove machines files and routes
4. Clean up AppLayout.tsx (remove machines logic, plan guards, payout alert)
5. Clean up auth.tsx Profile type
6. Verify the build compiles cleanly
