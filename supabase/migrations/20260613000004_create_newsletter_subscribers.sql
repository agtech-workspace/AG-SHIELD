CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  source text DEFAULT 'landing_page' CHECK (source IN ('landing_page', 'events', 'settings')),
  is_active boolean DEFAULT true,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  unsubscribed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON public.newsletter_subscribers (email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_active ON public.newsletter_subscribers (is_active);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon subscribe" ON public.newsletter_subscribers;
CREATE POLICY "Allow anon subscribe" ON public.newsletter_subscribers
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated read" ON public.newsletter_subscribers;
CREATE POLICY "Allow authenticated read" ON public.newsletter_subscribers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow authenticated update" ON public.newsletter_subscribers;
CREATE POLICY "Allow authenticated update" ON public.newsletter_subscribers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
