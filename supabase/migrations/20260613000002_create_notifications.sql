CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL CHECK (type IN ('risk_alert', 'report_update', 'merchant_approved', 'merchant_rejected', 'community_alert', 'system')),
  data jsonb,
  is_read boolean DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_device ON public.notifications (device_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
CREATE POLICY "Users can read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow anon insert for android" ON public.notifications;
CREATE POLICY "Allow anon insert for android" ON public.notifications
  FOR INSERT TO anon WITH CHECK (device_id IS NOT NULL AND user_id IS NULL);
