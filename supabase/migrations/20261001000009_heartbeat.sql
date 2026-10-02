-- Local runner heartbeat
CREATE TABLE IF NOT EXISTS public.runner_heartbeat (
  id SERIAL PRIMARY KEY,
  service TEXT NOT NULL,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_runner_heartbeat_service ON public.runner_heartbeat (service);

CREATE OR REPLACE FUNCTION public.update_runner_heartbeat(p_service TEXT, p_status TEXT DEFAULT 'ok', p_details JSONB DEFAULT '{}'::JSONB)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.runner_heartbeat (service, last_run_at, status, details)
  VALUES (p_service, NOW(), p_status, p_details)
  ON CONFLICT (service) DO UPDATE SET
    last_run_at = NOW(),
    status = EXCLUDED.status,
    details = EXCLUDED.details,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
