-- Add units_per_item to products:
-- For liquor/bottles: number of shots per bottle (e.g. 15 shots from a 750ml)
-- For cigarettes/packs: number of cigarettes/units per pack (e.g. 20 per pack)
-- 0 = not set (treat as whole-item sale, no splitting)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS units_per_item INTEGER NOT NULL DEFAULT 0;
