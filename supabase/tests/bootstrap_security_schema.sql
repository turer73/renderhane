\set ON_ERROR_STOP on

-- DISPOSABLE DATABASE ONLY. Never run bootstrap/test files against a project.
-- Use the actual legacy migrations so that the regression fixture includes the
-- old RLS policies, NULL guards, RPC signatures and signup trigger.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$$;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::UUID
$$;
CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE SQL STABLE AS $$
  SELECT current_setting('role', true)
$$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

CREATE PUBLICATION supabase_realtime;
-- The health migration is unrelated; 007 only needs these tables for policies.
CREATE TABLE public.system_status (id TEXT PRIMARY KEY);
CREATE TABLE public.system_health_logs (id UUID PRIMARY KEY);

\ir ../migrations/001_initial_schema.sql
\ir ../migrations/002_payment_id_unique.sql
\ir ../migrations/005_referral_system.sql
\ir ../migrations/007_security_hardening.sql
\ir ../migrations/008_user_segments.sql
\ir ../migrations/009_increase_signup_credits.sql
\ir ../migrations/011_subscriptions.sql
\ir ../migrations/013_fix_handle_new_user.sql
\ir ../migrations/015_outputs_job_id_unique.sql
\ir ../migrations/016_jobs_original_request.sql
\ir ../migrations/20260830_reserve_credit_bundle.sql
\ir ../migrations/20260831_social_kit_request_idempotency.sql

-- Supabase's legacy table grants are broad; RLS alone did not protect columns.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
-- Explicit column/PUBLIC grants must ALSO be removed, not only table grants.
GRANT UPDATE (credit_balance, unlimited_bg_remove) ON public.profiles TO authenticated, PUBLIC;
GRANT INSERT (id, user_id, tool, model_id, credit_cost) ON public.jobs TO authenticated, PUBLIC;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000101', 'security-one@example.invalid'),
  ('00000000-0000-0000-0000-000000000102', 'security-two@example.invalid');
UPDATE public.profiles SET credit_balance = 100, referral_code = 'AABBCC01'
  WHERE id = '00000000-0000-0000-0000-000000000101';
UPDATE public.profiles SET credit_balance = 100, referral_code = 'AABBCC02'
  WHERE id = '00000000-0000-0000-0000-000000000102';
INSERT INTO public.subscriptions (id, user_id, package_key, credits_per_period, price_per_period)
  VALUES ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000101', 'monthly', 50, 99);
