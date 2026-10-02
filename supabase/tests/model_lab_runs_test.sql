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
  -- History rows become tombstones; the API cannot hard-delete them.
  IF has_table_privilege('service_role', 'public.model_lab_runs', 'DELETE') THEN
    RAISE EXCEPTION 'service_role must not delete model_lab_runs rows';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.model_lab_input_deletions'::regclass) THEN
    RAISE EXCEPTION 'model_lab_input_deletions must have RLS enabled';
  END IF;
  IF has_table_privilege('authenticated', 'public.model_lab_input_deletions', 'SELECT')
     OR has_table_privilege('anon', 'public.model_lab_input_deletions', 'INSERT') THEN
    RAISE EXCEPTION 'client roles must have no privileges on model_lab_input_deletions';
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

  -- The storage lease is a plain timestamp the API compares and sets.
  UPDATE public.model_lab_runs SET status = 'completed', storage_state = 'pending', storage_lease_until = now() + INTERVAL '150 seconds'
  WHERE id = v_run.id;

  -- A tombstone may not keep content, a receipt or an active state.
  BEGIN
    UPDATE public.model_lab_runs SET deleted_at = now(), inputs = '[{"key":"prompt","kind":"text","value":"x"}]'::jsonb
    WHERE id = v_run.id;
    RAISE EXCEPTION 'tombstone with content accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  UPDATE public.model_lab_runs
  SET deleted_at = now(), inputs = '[]'::jsonb, outputs = '[]'::jsonb, receipt = NULL, error_message = NULL,
      storage_state = 'none', storage_lease_until = NULL
  WHERE id = v_run.id;

  -- A deleted run still blocks its client request id: no second charge.
  BEGIN
    INSERT INTO public.model_lab_runs (user_id, client_request_id, model_key, endpoint, status)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-4111-8111-111111111111', 'meshy-v71', 'meshy/v7.1/image-to-3d', 'submitting');
    RAISE EXCEPTION 'client request id reused after deletion';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.model_lab_runs WHERE id = v_run.id;
    RAISE EXCEPTION 'service_role hard-deleted a history row';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- Deletion claims: one per user and path, removable when a delete is abandoned.
  INSERT INTO public.model_lab_input_deletions (user_id, path)
  VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1/model-lab/inputs/1-a.png');
  BEGIN
    INSERT INTO public.model_lab_input_deletions (user_id, path)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1/model-lab/inputs/1-a.png');
    RAISE EXCEPTION 'duplicate deletion claim accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  DELETE FROM public.model_lab_input_deletions
  WHERE user_id = '00000000-0000-0000-0000-0000000000a1' AND path = '00000000-0000-0000-0000-0000000000a1/model-lab/inputs/1-a.png';
  INSERT INTO public.model_lab_input_deletions (user_id, path)
  VALUES ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b2/model-lab/inputs/1-b.png');
END $$;

RESET ROLE;

-- Deleting a profile removes its experiment history and deletion claims.
DELETE FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000b2';
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.model_lab_runs WHERE user_id = '00000000-0000-0000-0000-0000000000b2') THEN
    RAISE EXCEPTION 'history survived profile deletion';
  END IF;
  IF EXISTS (SELECT 1 FROM public.model_lab_input_deletions WHERE user_id = '00000000-0000-0000-0000-0000000000b2') THEN
    RAISE EXCEPTION 'deletion claims survived profile deletion';
  END IF;
END $$;

ROLLBACK;
