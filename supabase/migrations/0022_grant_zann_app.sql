-- Hosted Postgres (Supabase) cannot SET ROLE zann_app until the login role is a member.
GRANT zann_app TO postgres;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user) THEN
    EXECUTE format('GRANT zann_app TO %I', current_user);
  END IF;
END $$;
