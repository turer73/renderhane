\set ON_ERROR_STOP on

-- Contract for public.model_lab_runs. Runs on the disposable credit schema
-- (bootstrap_credit_schema.sql provides the roles and public.profiles).

BEGIN;

TRUNCATE public.profiles CASCADE;
INSERT INTO public.profiles (id, credit_balance)
VALUES
  ('00000000-0000-0000-0000-0000000000a1', 0),
  ('00000000-0000-0000-0000-0000000000b2', 0);

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.model_lab_runs'::regclass) THEN
    RAISE EXCEPTION 'model_lab_runs must have RLS enabled';
  END IF;
  IF has_table_privilege('authenticated', 'public.model_lab_runs', 'SELECT')
     OR has_table_privilege('authenticated', 'public.model_lab_runs', 'INSERT')
     OR has_table_privilege('anon', 'public.model_lab_runs', 'SELECT') THEN
    RAISE EXCEPTION 'client roles must have no privileges on model_lab_runs';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.model_lab_runs', 'INSERT') THEN
    RAISE EXCEPTION 'service_role must be able to write model_lab_runs';
  END IF;
END $$;

SET ROLE authenticated;
DO $$
BEGIN
  PERFORM 1 FROM public.model_lab_runs;
  RAISE EXCEPTION 'authenticated read model_lab_runs';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;

SET ROLE service_role;

DO $$
DECLARE
  v_run public.model_lab_runs;
BEGIN
  INSERT INTO public.model_lab_runs (user_id, client_request_id, model_key, endpoint, status)
  VALUES ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'meshy-v71', 'meshy/v7.1/image-to-3d', 'submitting')
  RETURNING * INTO v_run;

  IF v_run.storage_state IS DISTINCT FROM 'none'
     OR v_run.expires_at - v_run.created_at IS DISTINCT FROM INTERVAL '30 days'
     OR v_run.inputs IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION 'unexpected defaults: %', row_to_json(v_run);
  END IF;

  -- The same browser attempt cannot create a second paid run.
  BEGIN
    INSERT INTO public.model_lab_runs (user_id, client_request_id, model_key, endpoint, status)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'meshy-v71', 'meshy/v7.1/image-to-3d', 'submitting');
    RAISE EXCEPTION 'duplicate client request id accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- Another admin may reuse the value; uniqueness is per user.
  INSERT INTO public.model_lab_runs (user_id, client_request_id, model_key, endpoint, status)
  VALUES ('00000000-0000-0000-0000-0000000000b2', '11111111-1111-4111-8111-111111111111', 'meshy-v71', 'meshy/v7.1/image-to-3d', 'submitting');

  -- A queued run must stay pollable.
  BEGIN
    UPDATE public.model_lab_runs SET status = 'queued' WHERE id = v_run.id;
    RAISE EXCEPTION 'queued run without request id accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  UPDATE public.model_lab_runs
  SET status = 'queued', request_id = 'fal-request-1', receipt = 'payload.signature'
  WHERE id = v_run.id;

  BEGIN
    INSERT INTO public.model_lab_runs (user_id, client_request_id, model_key, endpoint, status)
    VALUES ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 'x', 'y', 'paid');
    RAISE EXCEPTION 'unknown status accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.model_lab_runs (user_id, client_request_id, model_key, endpoint, status, inputs)
    VALUES ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), 'x', 'y', 'failed', '{"prompt":"x"}'::jsonb);
    RAISE EXCEPTION 'non-array inputs accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

RESET ROLE;

-- Deleting a profile removes its experiment history.
DELETE FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000b2';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.model_lab_runs WHERE user_id = '00000000-0000-0000-0000-0000000000b2') THEN
    RAISE EXCEPTION 'history survived profile deletion';
  END IF;
END $$;

ROLLBACK;
