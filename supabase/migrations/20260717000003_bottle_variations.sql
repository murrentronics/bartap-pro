-- Bottle variations: stored on products as JSONB
-- Each variation: { key, label, units_consumed, price }
-- units_consumed = how many units from the bottle this variation uses
-- (bottle total capacity = products.units_per_item)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bottle_variations JSONB;

-- Track how many units of each variation have been sold per opened bottle
-- variation_counts: { "shot": 5, "nip": 2, "pq": 1, "half": 0, ... }
-- units_consumed: running total of units consumed from the bottle
ALTER TABLE public.opened_bottles
  ADD COLUMN IF NOT EXISTS variation_counts JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS units_consumed   INTEGER NOT NULL DEFAULT 0;
