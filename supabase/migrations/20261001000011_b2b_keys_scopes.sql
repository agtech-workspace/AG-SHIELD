-- Feature 3: Add scopes to API keys (reuse existing tables)
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS scopes TEXT[] NOT NULL DEFAULT '{"verify:read"}',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS name TEXT;

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON public.api_keys (revoked_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON public.api_keys (expires_at);
