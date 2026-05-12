-- Template images table: stores admin-approved product template images
CREATE TABLE IF NOT EXISTS public.template_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'beers',
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(url)
);

ALTER TABLE public.template_images ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read templates
CREATE POLICY "Read templates" ON public.template_images
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admin can insert/update/delete
CREATE POLICY "Admin manage templates" ON public.template_images
  FOR ALL USING (public.is_admin(auth.uid()));
