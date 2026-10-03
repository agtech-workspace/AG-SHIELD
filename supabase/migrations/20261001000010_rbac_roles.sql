-- Feature 3: RBAC roles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user','support','moderator','root_admin'));

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

-- Ensure existing admins keep role
UPDATE public.profiles
SET role = 'root_admin'
WHERE is_admin = TRUE AND (role IS NULL OR role = 'user');
