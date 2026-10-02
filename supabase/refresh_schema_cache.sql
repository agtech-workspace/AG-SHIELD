-- Run after schema updates if PostgREST schema cache appears stale.
notify pgrst, 'reload schema';
