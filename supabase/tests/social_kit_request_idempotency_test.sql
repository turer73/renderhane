\set ON_ERROR_STOP on

BEGIN;

TRUNCATE public.social_kit_requests, public.credit_transactions, public.profiles CASCADE;

INSERT INTO public.profiles (id, credit_balance)
VALUES
  ('00000000-0000-0000-0000-000000000101', 100),
  ('00000000-0000-0000-0000-000000000202', 100);

SET ROLE service_role;

DO $$
DECLARE
  v_claim RECORD;
  v_replay RECORD;
  v_conflict RECORD;
  v_active RECORD;
  v_active_duplicate RECORD;
  v_grace_duplicate RECORD;
  v_new_intent RECORD;
  v_other_user RECORD;
  v_request_id UUID;
  v_reservation_ids UUID[];
  v_repeated_ids UUID[];
  v_balance INTEGER;
  v_count INTEGER;
  v_completed BOOLEAN;
  v_rejected BOOLEAN;
BEGIN
  SELECT * INTO STRICT v_claim
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-0001',
    repeat('a', 64)
  );

  IF v_claim.disposition IS DISTINCT FROM 'acquired' THEN
    RAISE EXCEPTION 'first claim was not acquired: %', v_claim.disposition;
  END IF;
  v_request_id := v_claim.request_id;

  -- The production cron uses the service-role client to update stale request
  -- rows directly, so the fixture must exercise Supabase's BYPASSRLS contract
  -- in addition to the SECURITY DEFINER RPCs.
  PERFORM 1
  FROM public.social_kit_requests
  WHERE id = v_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'service_role could not read the claimed request';
  END IF;

  UPDATE public.social_kit_requests
  SET updated_at = updated_at
  WHERE id = v_request_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'service_role could not update the claimed request';
  END IF;

  SELECT public.reserve_social_kit_request_bundle(
    v_request_id,
    '00000000-0000-0000-0000-000000000101',
    ARRAY[8, 8, 8, 8, 35],
    ARRAY['scene 1', 'scene 2', 'scene 3', 'scene 4', 'video']
  ) INTO v_reservation_ids;

  SELECT public.reserve_social_kit_request_bundle(
    v_request_id,
    '00000000-0000-0000-0000-000000000101',
    ARRAY[8, 8, 8, 8, 35],
    ARRAY['scene 1', 'scene 2', 'scene 3', 'scene 4', 'video']
  ) INTO v_repeated_ids;

  SELECT credit_balance INTO v_balance
  FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000101';

  SELECT COUNT(*) INTO v_count
  FROM public.credit_transactions
  WHERE user_id = '00000000-0000-0000-0000-000000000101';

  IF cardinality(v_reservation_ids) IS DISTINCT FROM 5
     OR v_reservation_ids IS DISTINCT FROM v_repeated_ids
     OR v_balance IS DISTINCT FROM 33
     OR v_count IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION
      'request reservation was not idempotent: ids=%, repeated=%, balance=%, count=%',
      v_reservation_ids, v_repeated_ids, v_balance, v_count;
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.complete_social_kit_request(
      v_request_id,
      '00000000-0000-0000-0000-000000000101',
      200,
      '["not-an-object"]'::JSONB,
      '{}'::JSONB
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM IS DISTINCT FROM 'invalid_social_kit_response' THEN
        RAISE;
      END IF;
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'array response body was accepted';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.complete_social_kit_request(
      v_request_id,
      '00000000-0000-0000-0000-000000000101',
      200,
      '{"jobIds":["job-1"]}'::JSONB,
      '{"Retry-After":17}'::JSONB
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM IS DISTINCT FROM 'invalid_social_kit_response' THEN
        RAISE;
      END IF;
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'non-string response header was accepted';
  END IF;

  SELECT public.complete_social_kit_request(
    v_request_id,
    '00000000-0000-0000-0000-000000000101',
    200,
    '{"jobIds":["job-1"]}'::JSONB,
    '{"Retry-After":"17"}'::JSONB
  ) INTO v_completed;
  IF v_completed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'first completion did not update the request';
  END IF;

  SELECT public.complete_social_kit_request(
    v_request_id,
    '00000000-0000-0000-0000-000000000101',
    200,
    '{"jobIds":["job-1"]}'::JSONB,
    '{"Retry-After":"17"}'::JSONB
  ) INTO v_completed;
  IF v_completed IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'second completion was not a no-op';
  END IF;

  SELECT * INTO STRICT v_replay
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-0001',
    repeat('a', 64)
  );
  IF v_replay.disposition IS DISTINCT FROM 'replay'
     OR v_replay.request_id IS DISTINCT FROM v_request_id
     OR v_replay.response_status IS DISTINCT FROM 200
     OR v_replay.response_body IS DISTINCT FROM '{"jobIds":["job-1"]}'::JSONB
     OR v_replay.response_headers IS DISTINCT FROM '{"Retry-After":"17"}'::JSONB THEN
    RAISE EXCEPTION 'terminal replay mismatch: %', row_to_json(v_replay);
  END IF;

  SELECT * INTO STRICT v_conflict
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-0001',
    repeat('b', 64)
  );
  IF v_conflict.disposition IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'same key with different hash was not rejected';
  END IF;

  SELECT * INTO STRICT v_active
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-active-1',
    repeat('c', 64)
  );
  SELECT * INTO STRICT v_active_duplicate
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-active-2',
    repeat('c', 64)
  );
  IF v_active.disposition IS DISTINCT FROM 'acquired'
     OR v_active_duplicate.disposition IS DISTINCT FROM 'in_progress'
     OR v_active.request_id IS DISTINCT FROM v_active_duplicate.request_id THEN
    RAISE EXCEPTION 'active content guard failed';
  END IF;

  SELECT public.complete_social_kit_request(
    v_active.request_id,
    '00000000-0000-0000-0000-000000000101',
    200,
    '{"jobIds":["active-job"]}'::JSONB,
    '{}'::JSONB
  ) INTO v_completed;
  IF v_completed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'active alias fixture did not complete';
  END IF;

  SELECT * INTO STRICT v_active_duplicate
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-active-2',
    repeat('c', 64)
  );
  IF v_active_duplicate.disposition IS DISTINCT FROM 'replay'
     OR v_active_duplicate.request_id IS DISTINCT FROM v_active.request_id
     OR v_active_duplicate.response_body IS DISTINCT FROM
        '{"jobIds":["active-job"]}'::JSONB THEN
    RAISE EXCEPTION 'joined key was not durably aliased after completion';
  END IF;

  SELECT * INTO STRICT v_conflict
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-active-2',
    repeat('d', 64)
  );
  IF v_conflict.disposition IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'aliased key accepted a changed request hash';
  END IF;

  -- A new key that arrives just after terminalization is still a plausible
  -- concurrent-tab upload and must replay within the dedupe grace window.
  SELECT * INTO STRICT v_grace_duplicate
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-active-3',
    repeat('c', 64)
  );
  IF v_grace_duplicate.disposition IS DISTINCT FROM 'replay'
     OR v_grace_duplicate.request_id IS DISTINCT FROM v_active.request_id THEN
    RAISE EXCEPTION 'terminal grace key opened a duplicate request';
  END IF;

  UPDATE public.social_kit_requests
  SET completed_at = now() - INTERVAL '11 minutes',
      updated_at = now() - INTERVAL '11 minutes'
  WHERE id = v_active.request_id;

  -- Once the grace window expires, a fresh key is an intentional rerun.
  SELECT * INTO STRICT v_new_intent
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-active-4',
    repeat('c', 64)
  );
  IF v_new_intent.disposition IS DISTINCT FROM 'acquired'
     OR v_new_intent.request_id IS NOT DISTINCT FROM v_active.request_id THEN
    RAISE EXCEPTION 'post-grace intent was incorrectly replayed';
  END IF;

  SELECT * INTO STRICT v_claim
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-failed-1',
    repeat('e', 64)
  );
  SELECT public.complete_social_kit_request(
    v_claim.request_id,
    '00000000-0000-0000-0000-000000000101',
    500,
    '{"error":"provider rejected corrected input"}'::JSONB,
    '{}'::JSONB
  ) INTO v_completed;
  SELECT * INTO STRICT v_new_intent
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000101',
    'request-key-failed-2',
    repeat('e', 64)
  );
  IF v_new_intent.disposition IS DISTINCT FROM 'acquired'
     OR v_new_intent.request_id IS NOT DISTINCT FROM v_claim.request_id THEN
    RAISE EXCEPTION 'failed request blocked an immediate corrected retry';
  END IF;

  SELECT * INTO STRICT v_other_user
  FROM public.claim_social_kit_request(
    '00000000-0000-0000-0000-000000000202',
    'request-key-0001',
    repeat('a', 64)
  );
  IF v_other_user.disposition IS DISTINCT FROM 'acquired' THEN
    RAISE EXCEPTION 'same key should be independent across users';
  END IF;
END;
$$;

DO $$
DECLARE
  v_success RECORD;
  v_replay RECORD;
  v_conflict RECORD;
  v_late_success RECORD;
  v_failure TEXT;
  v_cancel TEXT;
  v_status TEXT;
  v_tx_status TEXT;
  v_tx_job_id UUID;
  v_fal_url TEXT;
  v_balance INTEGER;
  v_count INTEGER;
  v_rejected BOOLEAN;
BEGIN
  INSERT INTO public.projects (id, user_id, name)
  VALUES (
    '00000000-0000-0000-0000-000000000900',
    '00000000-0000-0000-0000-000000000202',
    'Webhook contract project'
  );

  UPDATE public.profiles
  SET credit_balance = 68
  WHERE id = '00000000-0000-0000-0000-000000000202';

  INSERT INTO public.credit_transactions (
    id, user_id, amount, type, status, description
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000601',
      '00000000-0000-0000-0000-000000000202',
      -8,
      'spend',
      'reserved',
      'successful webhook reservation'
    ),
    (
      '00000000-0000-0000-0000-000000000602',
      '00000000-0000-0000-0000-000000000202',
      -8,
      'spend',
      'reserved',
      'failed webhook reservation'
    ),
    (
      '00000000-0000-0000-0000-000000000603',
      '00000000-0000-0000-0000-000000000202',
      -8,
      'spend',
      'reserved',
      'legacy output reservation'
    ),
    (
      '00000000-0000-0000-0000-000000000604',
      '00000000-0000-0000-0000-000000000202',
      -8,
      'spend',
      'reserved',
      'cancelled job reservation'
    ),
    (
      '00000000-0000-0000-0000-000000000605',
      '00000000-0000-0000-0000-000000000202',
      -7,
      'spend',
      'reserved',
      'malformed amount fixture'
    ),
    (
      '00000000-0000-0000-0000-000000000606',
      '00000000-0000-0000-0000-000000000202',
      8,
      'purchase',
      'reserved',
      'malformed type fixture'
    );

  INSERT INTO public.jobs (
    id, user_id, project_id, tool, status, credit_cost, credit_tx_id,
    created_at, started_at
  ) VALUES
    (
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000202',
      '00000000-0000-0000-0000-000000000900',
      'scene',
      'processing',
      8,
      '00000000-0000-0000-0000-000000000601',
      now() - INTERVAL '1 hour',
      now() - INTERVAL '1 hour'
    ),
    (
      '00000000-0000-0000-0000-000000000502',
      '00000000-0000-0000-0000-000000000202',
      '00000000-0000-0000-0000-000000000900',
      'scene',
      'processing',
      8,
      '00000000-0000-0000-0000-000000000602',
      now() - INTERVAL '1 hour',
      now() - INTERVAL '1 hour'
    ),
    (
      '00000000-0000-0000-0000-000000000503',
      '00000000-0000-0000-0000-000000000202',
      NULL,
      'scene',
      'pending',
      0,
      NULL,
      now(),
      NULL
    ),
    (
      '00000000-0000-0000-0000-000000000504',
      '00000000-0000-0000-0000-000000000202',
      NULL,
      'scene',
      'processing',
      8,
      '00000000-0000-0000-0000-000000000603',
      now() - INTERVAL '1 hour',
      now() - INTERVAL '1 hour'
    ),
    (
      '00000000-0000-0000-0000-000000000505',
      '00000000-0000-0000-0000-000000000202',
      NULL,
      'scene',
      'processing',
      8,
      '00000000-0000-0000-0000-000000000604',
      now() - INTERVAL '1 hour',
      now() - INTERVAL '1 hour'
    ),
    (
      '00000000-0000-0000-0000-000000000506',
      '00000000-0000-0000-0000-000000000202',
      NULL,
      'scene',
      'processing',
      8,
      '00000000-0000-0000-0000-000000000605',
      now() - INTERVAL '1 hour',
      now() - INTERVAL '1 hour'
    ),
    (
      '00000000-0000-0000-0000-000000000507',
      '00000000-0000-0000-0000-000000000202',
      NULL,
      'scene',
      'processing',
      8,
      '00000000-0000-0000-0000-000000000606',
      now() - INTERVAL '1 hour',
      now() - INTERVAL '1 hour'
    ),
    (
      '00000000-0000-0000-0000-000000000508',
      '00000000-0000-0000-0000-000000000202',
      NULL,
      'scene',
      'pending',
      0,
      NULL,
      now(),
      NULL
    );

  UPDATE public.jobs
  SET fal_request_id = 'fal-cancel-505'
  WHERE id = '00000000-0000-0000-0000-000000000505';
  UPDATE public.jobs
  SET fal_request_id = 'fal-cancel-508'
  WHERE id = '00000000-0000-0000-0000-000000000508';

  SELECT * INTO STRICT v_success
  FROM public.complete_job_output_and_spend(
    '00000000-0000-0000-0000-000000000501',
    'https://provider.example/success.png',
    '{"images":[{"url":"https://provider.example/success.png"}]}'::JSONB
  );

  SELECT status INTO STRICT v_status
  FROM public.jobs
  WHERE id = '00000000-0000-0000-0000-000000000501';
  SELECT status, job_id INTO STRICT v_tx_status, v_tx_job_id
  FROM public.credit_transactions
  WHERE id = '00000000-0000-0000-0000-000000000601';
  SELECT COUNT(*) INTO v_count
  FROM public.outputs
  WHERE job_id = '00000000-0000-0000-0000-000000000501';

  IF v_success.disposition IS DISTINCT FROM 'completed'
     OR v_success.output_id IS NULL
     OR v_status IS DISTINCT FROM 'completed'
     OR v_tx_status IS DISTINCT FROM 'completed'
     OR v_tx_job_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000501'
     OR v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'atomic webhook completion failed: %', row_to_json(v_success);
  END IF;

  SELECT * INTO STRICT v_replay
  FROM public.complete_job_output_and_spend(
    '00000000-0000-0000-0000-000000000501',
    'https://provider.example/success.png',
    '{"images":[{"url":"https://provider.example/success.png"}]}'::JSONB
  );
  IF v_replay.disposition IS DISTINCT FROM 'replayed'
     OR v_replay.output_id IS DISTINCT FROM v_success.output_id THEN
    RAISE EXCEPTION 'webhook completion replay was not idempotent';
  END IF;

  SELECT * INTO STRICT v_conflict
  FROM public.complete_job_output_and_spend(
    '00000000-0000-0000-0000-000000000501',
    'https://provider.example/different.png',
    '{"images":[{"url":"https://provider.example/different.png"}]}'::JSONB
  );
  SELECT fal_url INTO STRICT v_fal_url
  FROM public.outputs
  WHERE job_id = '00000000-0000-0000-0000-000000000501';
  IF v_conflict.disposition IS DISTINCT FROM 'payload_conflict'
     OR v_fal_url IS DISTINCT FROM 'https://provider.example/success.png' THEN
    RAISE EXCEPTION 'conflicting webhook payload replaced durable output';
  END IF;

  SELECT public.fail_job_and_refund(
    '00000000-0000-0000-0000-000000000501',
    'late failure',
    NULL
  ) INTO v_failure;
  IF v_failure IS DISTINCT FROM 'already_completed' THEN
    RAISE EXCEPTION 'late failure refunded a completed job';
  END IF;

  SELECT public.fail_job_and_refund(
    '00000000-0000-0000-0000-000000000502',
    'provider failed',
    now() - INTERVAL '30 minutes'
  ) INTO v_failure;
  SELECT credit_balance INTO STRICT v_balance
  FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000202';
  SELECT status INTO STRICT v_status
  FROM public.jobs
  WHERE id = '00000000-0000-0000-0000-000000000502';
  SELECT status INTO STRICT v_tx_status
  FROM public.credit_transactions
  WHERE id = '00000000-0000-0000-0000-000000000602';
  IF v_failure IS DISTINCT FROM 'failed_refunded'
     OR v_balance IS DISTINCT FROM 76
     OR v_status IS DISTINCT FROM 'failed'
     OR v_tx_status IS DISTINCT FROM 'refunded' THEN
    RAISE EXCEPTION 'atomic failure/refund contract failed';
  END IF;

  SELECT public.fail_job_and_refund(
    '00000000-0000-0000-0000-000000000502',
    'provider failed again',
    NULL
  ) INTO v_failure;
  SELECT credit_balance INTO STRICT v_balance
  FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000202';
  IF v_failure IS DISTINCT FROM 'already_failed_refunded'
     OR v_balance IS DISTINCT FROM 76 THEN
    RAISE EXCEPTION 'failure replay refunded twice';
  END IF;

  SELECT * INTO STRICT v_late_success
  FROM public.complete_job_output_and_spend(
    '00000000-0000-0000-0000-000000000502',
    'https://provider.example/late.png',
    '{"image":{"url":"https://provider.example/late.png"}}'::JSONB
  );
  IF v_late_success.disposition IS DISTINCT FROM 'terminal_conflict' THEN
    RAISE EXCEPTION 'late success resurrected a refunded job';
  END IF;

  SELECT public.fail_job_and_refund(
    '00000000-0000-0000-0000-000000000503',
    'not stale',
    now() - INTERVAL '30 minutes'
  ) INTO v_failure;
  IF v_failure IS DISTINCT FROM 'not_eligible' THEN
    RAISE EXCEPTION 'fresh job failed from a stale snapshot';
  END IF;

  INSERT INTO public.outputs (
    job_id, user_id, project_id, type, fal_url, metadata
  ) VALUES (
    '00000000-0000-0000-0000-000000000504',
    '00000000-0000-0000-0000-000000000202',
    NULL,
    'image',
    'https://provider.example/legacy.png',
    '{}'::JSONB
  );
  SELECT public.fail_job_and_refund(
    '00000000-0000-0000-0000-000000000504',
    'stale snapshot',
    now() - INTERVAL '30 minutes'
  ) INTO v_failure;
  SELECT status INTO STRICT v_status
  FROM public.jobs
  WHERE id = '00000000-0000-0000-0000-000000000504';
  SELECT status, job_id INTO STRICT v_tx_status, v_tx_job_id
  FROM public.credit_transactions
  WHERE id = '00000000-0000-0000-0000-000000000603';
  IF v_failure IS DISTINCT FROM 'output_repaired'
     OR v_status IS DISTINCT FROM 'completed'
     OR v_tx_status IS DISTINCT FROM 'completed'
     OR v_tx_job_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000504' THEN
    RAISE EXCEPTION 'durable output was not repaired atomically';
  END IF;

  SELECT public.cancel_job_and_refund(
    '00000000-0000-0000-0000-000000000505',
    'Active provider cancellation is disabled',
    'fal-cancel-505'
  ) INTO v_cancel;
  SELECT credit_balance INTO STRICT v_balance
  FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000202';
  SELECT status INTO STRICT v_status
  FROM public.jobs
  WHERE id = '00000000-0000-0000-0000-000000000505';
  SELECT status INTO STRICT v_tx_status
  FROM public.credit_transactions
  WHERE id = '00000000-0000-0000-0000-000000000604';
  IF v_cancel IS DISTINCT FROM 'not_cancellable'
     OR v_balance IS DISTINCT FROM 76
     OR v_status IS DISTINCT FROM 'processing'
     OR v_tx_status IS DISTINCT FROM 'reserved' THEN
    RAISE EXCEPTION 'active provider cancellation changed financial state';
  END IF;

  SELECT * INTO STRICT v_late_success
  FROM public.complete_job_output_and_spend(
    '00000000-0000-0000-0000-000000000505',
    'https://provider.example/cancelled-late.png',
    '{"image":{"url":"https://provider.example/cancelled-late.png"}}'::JSONB
  );
  SELECT status INTO STRICT v_status
  FROM public.jobs
  WHERE id = '00000000-0000-0000-0000-000000000505';
  SELECT status INTO STRICT v_tx_status
  FROM public.credit_transactions
  WHERE id = '00000000-0000-0000-0000-000000000604';
  IF v_late_success.disposition IS DISTINCT FROM 'completed'
     OR v_status IS DISTINCT FROM 'completed'
     OR v_tx_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'provider success after disabled cancellation did not spend';
  END IF;

  SELECT public.cancel_job_and_refund(
    '00000000-0000-0000-0000-000000000508',
    'Active provider cancellation is disabled',
    'fal-cancel-508'
  ) INTO v_cancel;
  IF v_cancel IS DISTINCT FROM 'not_cancellable' THEN
    RAISE EXCEPTION 'active free job cancellation bypassed the safety gate';
  END IF;

  SELECT public.cancel_job_and_refund(
    '00000000-0000-0000-0000-000000000501',
    'Too late',
    NULL
  ) INTO v_cancel;
  IF v_cancel IS DISTINCT FROM 'already_completed' THEN
    RAISE EXCEPTION 'completed job was cancelled';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.fail_job_and_refund(
      '00000000-0000-0000-0000-000000000506',
      'malformed reservation',
      NULL
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM IS DISTINCT FROM 'job_credit_transaction_amount_mismatch' THEN
        RAISE;
      END IF;
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'mismatched reservation amount was refunded';
  END IF;

  v_rejected := FALSE;
  BEGIN
    PERFORM public.complete_job_output_and_spend(
      '00000000-0000-0000-0000-000000000507',
      'https://provider.example/invalid-ledger.png',
      '{}'::JSONB
    );
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM IS DISTINCT FROM 'job_credit_transaction_amount_mismatch' THEN
        RAISE;
      END IF;
      v_rejected := TRUE;
  END;
  IF NOT v_rejected THEN
    RAISE EXCEPTION 'non-spend reservation completed a paid job';
  END IF;

  SELECT COUNT(*) INTO STRICT v_count
  FROM public.outputs
  WHERE job_id IN (
    '00000000-0000-0000-0000-000000000506',
    '00000000-0000-0000-0000-000000000507'
  );
  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'invalid ledger fixture produced an output';
  END IF;

  -- Legacy versions could leave a cancelled job with both a durable output
  -- and a reserved transaction. Maintenance must not retain the output while
  -- refunding the charge; leave the row fail-closed for explicit policy.
  UPDATE public.profiles
  SET credit_balance = credit_balance - 8
  WHERE id = '00000000-0000-0000-0000-000000000202';
  INSERT INTO public.credit_transactions (
    id, user_id, amount, type, status, description
  ) VALUES (
    '00000000-0000-0000-0000-000000000607',
    '00000000-0000-0000-0000-000000000202',
    -8,
    'spend',
    'reserved',
    'cancelled output conflict fixture'
  );
  INSERT INTO public.jobs (
    id, user_id, project_id, tool, status, credit_cost, credit_tx_id,
    created_at, started_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000509',
    '00000000-0000-0000-0000-000000000202',
    NULL,
    'scene',
    'cancelled',
    8,
    '00000000-0000-0000-0000-000000000607',
    now() - INTERVAL '1 hour',
    now() - INTERVAL '1 hour'
  );
  INSERT INTO public.outputs (
    job_id, user_id, project_id, type, fal_url, metadata
  ) VALUES (
    '00000000-0000-0000-0000-000000000509',
    '00000000-0000-0000-0000-000000000202',
    NULL,
    'image',
    'https://provider.example/cancelled-legacy.png',
    '{}'::JSONB
  );

  SELECT public.fail_job_and_refund(
    '00000000-0000-0000-0000-000000000509',
    'late failure after legacy cancellation',
    NULL
  ) INTO v_failure;
  SELECT credit_balance INTO STRICT v_balance
  FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000202';
  SELECT status INTO STRICT v_tx_status
  FROM public.credit_transactions
  WHERE id = '00000000-0000-0000-0000-000000000607';
  IF v_failure IS DISTINCT FROM 'output_present'
     OR v_balance IS DISTINCT FROM 68
     OR v_tx_status IS DISTINCT FROM 'reserved' THEN
    RAISE EXCEPTION 'cancelled durable output was incorrectly refunded';
  END IF;
END;
$$;

DO $$
DECLARE
  v_page JSONB;
  v_page_index INTEGER;
BEGIN
  INSERT INTO public.jobs (
    id, user_id, tool, status, credit_cost, created_at, started_at
  )
  SELECT (
           '10000000-0000-0000-0000-' ||
           lpad(series.value::TEXT, 12, '0')
         )::UUID,
         '00000000-0000-0000-0000-000000000101',
         'scene',
         'processing',
         0,
         now() - INTERVAL '4 hours' + series.value * INTERVAL '1 second',
         now() - INTERVAL '4 hours' + series.value * INTERVAL '1 second'
  FROM generate_series(1, 501) AS series(value);

  FOR v_page_index IN 1..10 LOOP
    SELECT public.take_maintenance_scan_page(
      'stuck_jobs',
      now() - INTERVAL '3 hours',
      50
    ) INTO v_page;
    IF jsonb_array_length(v_page->'rows') IS DISTINCT FROM 50
       OR (v_page->>'scanTruncated')::BOOLEAN IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'maintenance cursor stopped before page %', v_page_index;
    END IF;
  END LOOP;

  SELECT public.take_maintenance_scan_page(
    'stuck_jobs',
    now() - INTERVAL '3 hours',
    50
  ) INTO v_page;
  IF jsonb_array_length(v_page->'rows') IS DISTINCT FROM 1
     OR v_page->'rows'->0->>'id' IS DISTINCT FROM
        '10000000-0000-0000-0000-000000000501'
     OR (v_page->>'cycleComplete')::BOOLEAN IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'maintenance cursor starved row 501: %', v_page;
  END IF;
END;
$$;

RESET ROLE;
SET ROLE authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.claim_social_kit_request(
      '00000000-0000-0000-0000-000000000101',
      'unauthorized-key',
      repeat('f', 64)
    );
    RAISE EXCEPTION 'expected authorization failure';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%unauthorized%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_signature TEXT;
  v_count INTEGER;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.claim_social_kit_request(uuid,text,text)',
    'public.reserve_social_kit_request_bundle(uuid,uuid,integer[],text[])',
    'public.complete_social_kit_request(uuid,uuid,integer,jsonb,jsonb)',
    'public.complete_job_output_and_spend(uuid,text,jsonb)',
    'public.fail_job_and_refund(uuid,text,timestamp with time zone)',
    'public.cancel_job_and_refund(uuid,text,text)',
    'public.take_maintenance_scan_page(text,timestamp with time zone,integer)'
  ]
  LOOP
    IF pg_catalog.has_function_privilege(
         'service_role', v_signature, 'EXECUTE'
       ) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'service_role execute grant missing for %', v_signature;
    END IF;

    IF pg_catalog.has_function_privilege(
         'anon', v_signature, 'EXECUTE'
       ) IS DISTINCT FROM FALSE
       OR pg_catalog.has_function_privilege(
         'authenticated', v_signature, 'EXECUTE'
       ) IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'untrusted role can execute %', v_signature;
    END IF;
  END LOOP;

  IF pg_catalog.has_table_privilege(
       'service_role',
       'public.maintenance_scan_cursors',
       'SELECT,INSERT,UPDATE,DELETE'
     ) IS DISTINCT FROM FALSE
     OR pg_catalog.has_table_privilege(
       'anon',
       'public.maintenance_scan_cursors',
       'SELECT,INSERT,UPDATE,DELETE'
     ) IS DISTINCT FROM FALSE
     OR pg_catalog.has_table_privilege(
       'authenticated',
       'public.maintenance_scan_cursors',
       'SELECT,INSERT,UPDATE,DELETE'
     ) IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'maintenance cursor table is directly accessible';
  END IF;

  IF to_regprocedure(
       'public.complete_social_kit_request(uuid,uuid,integer,jsonb)'
     ) IS NOT NULL THEN
    RAISE EXCEPTION 'insecure four-argument completion overload survived';
  END IF;

  FOREACH v_signature IN ARRAY ARRAY[
    'public.social_kit_requests',
    'public.social_kit_request_keys'
  ]
  LOOP
    IF pg_catalog.has_table_privilege(
         'service_role', v_signature, 'SELECT,INSERT,UPDATE,DELETE'
       ) IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'service_role table grant missing for %', v_signature;
    END IF;

    IF pg_catalog.has_table_privilege(
         'anon', v_signature, 'SELECT,INSERT,UPDATE,DELETE'
       ) IS DISTINCT FROM FALSE
       OR pg_catalog.has_table_privilege(
         'authenticated', v_signature, 'SELECT,INSERT,UPDATE,DELETE'
       ) IS DISTINCT FROM FALSE THEN
      RAISE EXCEPTION 'untrusted role can access %', v_signature;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_count
  FROM public.social_kit_requests AS request
  LEFT JOIN public.social_kit_request_keys AS request_key
    ON request_key.user_id = request.user_id
   AND request_key.idempotency_key = request.idempotency_key
   AND request_key.request_id = request.id
  WHERE request_key.request_id IS NULL;

  IF v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'canonical request aliases drifted: %', v_count;
  END IF;
END;
$$;

ROLLBACK;
