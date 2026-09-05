-- Durable request idempotency for Social Kit submissions.
--
-- This migration is intentionally additive so the currently deployed app
-- remains compatible while the database is prepared before the application
-- release. The new app must fail closed when these RPCs are unavailable.

DO $$
BEGIN
  IF to_regprocedure(
    'public.reserve_credit_bundle(uuid,integer[],text[])'
  ) IS NULL THEN
    RAISE EXCEPTION 'social_kit_schema_incomplete: reserve_credit_bundle missing';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.social_kit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'succeeded', 'failed')),
  reservation_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  response_status INTEGER
    CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_body JSONB,
  response_headers JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT social_kit_requests_user_key_unique
    UNIQUE (user_id, idempotency_key),
  CONSTRAINT social_kit_requests_terminal_response_check CHECK (
    (status = 'processing' AND response_status IS NULL AND response_body IS NULL)
    OR
    (status != 'processing' AND response_status IS NOT NULL AND response_body IS NOT NULL)
  )
);

ALTER TABLE public.social_kit_requests
  ADD COLUMN IF NOT EXISTS response_headers JSONB NOT NULL DEFAULT '{}'::JSONB;

-- Persist every client key that joined an already-active semantic request.
-- Without this alias, a second tab's key would be blocked only while the
-- canonical request was processing, then could acquire a second paid bundle
-- when retried after the canonical response became terminal.
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_kit_requests_id_user
  ON public.social_kit_requests (id, user_id);

CREATE TABLE IF NOT EXISTS public.social_kit_request_keys (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, idempotency_key),
  CONSTRAINT social_kit_request_keys_request_owner_fk
    FOREIGN KEY (request_id, user_id)
    REFERENCES public.social_kit_requests(id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_social_kit_request_keys_request_id
  ON public.social_kit_request_keys (request_id);

-- Durable high-water cursors prevent a fixed set of old, non-actionable rows
-- from permanently hiding later cleanup work behind the cron page budget.
CREATE TABLE IF NOT EXISTS public.maintenance_scan_cursors (
  scan_name TEXT PRIMARY KEY,
  cursor_created_at TIMESTAMPTZ,
  cursor_id TEXT,
  high_water_created_at TIMESTAMPTZ,
  high_water_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_scan_cursors_name_check CHECK (
    scan_name IN ('stuck_jobs', 'reserved_transactions', 'social_kit_requests')
  ),
  CONSTRAINT maintenance_scan_cursors_cursor_pair_check CHECK (
    (cursor_created_at IS NULL) = (cursor_id IS NULL)
  ),
  CONSTRAINT maintenance_scan_cursors_high_water_pair_check CHECK (
    (high_water_created_at IS NULL) = (high_water_id IS NULL)
  )
);

INSERT INTO public.social_kit_request_keys (
  user_id,
  idempotency_key,
  request_id
)
SELECT request.user_id, request.idempotency_key, request.id
FROM public.social_kit_requests AS request
ON CONFLICT (user_id, idempotency_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.social_kit_requests AS request
    LEFT JOIN public.social_kit_request_keys AS request_key
      ON request_key.user_id = request.user_id
     AND request_key.idempotency_key = request.idempotency_key
     AND request_key.request_id = request.id
    WHERE request_key.request_id IS NULL
  ) THEN
    RAISE EXCEPTION 'social_kit_schema_drift: canonical request key mismatch';
  END IF;
END;
$$;

-- A different browser tab normally creates a different idempotency key. The
-- semantic request hash includes the client-computed source-file digest, so
-- only one equal request may be processing for a user at a time. Completed
-- requests do not block an intentional later rerun.
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_kit_requests_active_hash
  ON public.social_kit_requests (user_id, request_hash)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_social_kit_requests_created_at
  ON public.social_kit_requests (created_at);

-- IF NOT EXISTS is intentionally re-runnable, but it must never turn a
-- same-named drifted object into a false-successful migration. Verify the two
-- concurrency invariants against the PostgreSQL catalog before exposing RPCs.
DO $$
DECLARE
  v_user_attnum SMALLINT;
  v_key_attnum SMALLINT;
  v_hash_attnum SMALLINT;
  v_alias_user_attnum SMALLINT;
  v_alias_key_attnum SMALLINT;
  v_alias_request_attnum SMALLINT;
  v_request_id_attnum SMALLINT;
BEGIN
  SELECT attnum INTO v_user_attnum
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.social_kit_requests'::REGCLASS
    AND attname = 'user_id'
    AND NOT attisdropped;

  SELECT attnum INTO v_key_attnum
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.social_kit_requests'::REGCLASS
    AND attname = 'idempotency_key'
    AND NOT attisdropped;

  SELECT attnum INTO v_hash_attnum
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.social_kit_requests'::REGCLASS
    AND attname = 'request_hash'
    AND NOT attisdropped;

  SELECT attnum INTO v_request_id_attnum
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.social_kit_requests'::REGCLASS
    AND attname = 'id'
    AND NOT attisdropped;

  SELECT attnum INTO v_alias_user_attnum
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.social_kit_request_keys'::REGCLASS
    AND attname = 'user_id'
    AND NOT attisdropped;

  SELECT attnum INTO v_alias_key_attnum
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.social_kit_request_keys'::REGCLASS
    AND attname = 'idempotency_key'
    AND NOT attisdropped;

  SELECT attnum INTO v_alias_request_attnum
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.social_kit_request_keys'::REGCLASS
    AND attname = 'request_id'
    AND NOT attisdropped;

  IF v_user_attnum IS NULL OR v_key_attnum IS NULL OR v_hash_attnum IS NULL THEN
    RAISE EXCEPTION 'social_kit_schema_drift: required request columns missing';
  END IF;

  IF v_request_id_attnum IS NULL
     OR v_alias_user_attnum IS NULL
     OR v_alias_key_attnum IS NULL
     OR v_alias_request_attnum IS NULL THEN
    RAISE EXCEPTION 'social_kit_schema_drift: alias columns missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.social_kit_requests'::REGCLASS
      AND constraint_row.contype = 'u'
      AND constraint_row.conkey = ARRAY[v_user_attnum, v_key_attnum]::SMALLINT[]
  ) THEN
    RAISE EXCEPTION 'social_kit_schema_drift: user/idempotency key guard missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_row
    WHERE index_row.indexrelid =
          'public.idx_social_kit_requests_active_hash'::REGCLASS
      AND index_row.indrelid = 'public.social_kit_requests'::REGCLASS
      AND index_row.indisunique
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indnatts = 2
      AND index_row.indnkeyatts = 2
      AND index_row.indkey[0] = v_user_attnum
      AND index_row.indkey[1] = v_hash_attnum
      AND pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid)
          = '(status = ''processing''::text)'
  ) THEN
    RAISE EXCEPTION 'social_kit_schema_drift: active request hash guard invalid';
  END IF;


  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.social_kit_request_keys'::REGCLASS
      AND constraint_row.contype = 'p'
      AND constraint_row.conkey =
          ARRAY[v_alias_user_attnum, v_alias_key_attnum]::SMALLINT[]
  ) THEN
    RAISE EXCEPTION 'social_kit_schema_drift: alias primary key invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid = 'public.social_kit_request_keys'::REGCLASS
      AND constraint_row.confrelid = 'public.social_kit_requests'::REGCLASS
      AND constraint_row.contype = 'f'
      AND constraint_row.conkey =
          ARRAY[v_alias_request_attnum, v_alias_user_attnum]::SMALLINT[]
      AND constraint_row.confkey =
          ARRAY[v_request_id_attnum, v_user_attnum]::SMALLINT[]
  ) THEN
    RAISE EXCEPTION 'social_kit_schema_drift: alias request owner FK invalid';
  END IF;

END;
$$;

ALTER TABLE public.social_kit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_kit_request_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_scan_cursors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.social_kit_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.social_kit_request_keys
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.maintenance_scan_cursors
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.social_kit_requests
  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.social_kit_request_keys
  TO service_role;

ALTER FUNCTION public.reserve_credit_bundle(UUID, INTEGER[], TEXT[])
  SET search_path = pg_catalog, public, pg_temp;

-- An early, unreleased draft returned five OUT columns from this same input
-- signature. PostgreSQL cannot change a function's return row type with
-- CREATE OR REPLACE. Drop only that incompatible draft; preserving the final
-- signature on reapply also preserves any later dependencies.
DO $$
DECLARE
  v_function_oid OID := to_regprocedure(
    'public.claim_social_kit_request(uuid,text,text)'
  );
  v_output_types TEXT[];
  v_output_names TEXT[];
  v_returns_set BOOLEAN;
BEGIN
  IF v_function_oid IS NULL THEN
    RETURN;
  END IF;

  SELECT array_agg(pg_catalog.format_type(argument.type_oid, NULL)
                   ORDER BY argument.ordinality),
         array_agg(argument.argument_name ORDER BY argument.ordinality),
         bool_and(procedure_row.proretset)
    INTO v_output_types, v_output_names, v_returns_set
  FROM pg_catalog.pg_proc AS procedure_row
  CROSS JOIN LATERAL unnest(
    procedure_row.proallargtypes,
    procedure_row.proargmodes,
    procedure_row.proargnames
  ) WITH ORDINALITY AS argument(
    type_oid, argument_mode, argument_name, ordinality
  )
  WHERE procedure_row.oid = v_function_oid
    AND argument.argument_mode IN ('o', 'b', 't');

  IF NOT COALESCE(v_returns_set, FALSE)
     OR v_output_types IS DISTINCT FROM ARRAY[
       'uuid', 'text', 'uuid[]', 'integer', 'jsonb', 'jsonb'
     ]::TEXT[]
     OR v_output_names IS DISTINCT FROM ARRAY[
       'request_id', 'disposition', 'reservation_ids',
       'response_status', 'response_body', 'response_headers'
     ]::TEXT[] THEN
    DROP FUNCTION public.claim_social_kit_request(UUID, TEXT, TEXT);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_social_kit_request(
  p_user_id UUID,
  p_idempotency_key TEXT,
  p_request_hash TEXT
) RETURNS TABLE (
  request_id UUID,
  disposition TEXT,
  reservation_ids UUID[],
  response_status INTEGER,
  response_body JSONB,
  response_headers JSONB
) AS $$
DECLARE
  v_request public.social_kit_requests%ROWTYPE;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_idempotency_key IS NULL
     OR char_length(p_idempotency_key) < 8
     OR char_length(p_idempotency_key) > 128
     OR p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  IF p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_request_hash';
  END IF;

  -- Serialize semantic claims with completion. This closes the narrow window
  -- where an alternate key could arrive before completion but have its INSERT
  -- unblock only after the active partial-index entry disappeared.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::TEXT || ':' || p_request_hash,
      0
    )
  );

  -- A canonical or alias key is permanent for this logical request. This
  -- lookup happens before a new insert so a retry after terminalization always
  -- replays instead of opening another paid bundle.
  SELECT request.* INTO v_request
  FROM public.social_kit_request_keys AS request_key
  JOIN public.social_kit_requests AS request
    ON request.id = request_key.request_id
   AND request.user_id = request_key.user_id
  WHERE request_key.user_id = p_user_id
    AND request_key.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_request.id,
      CASE
        WHEN v_request.request_hash != p_request_hash THEN 'conflict'::TEXT
        WHEN v_request.status = 'processing' THEN 'in_progress'::TEXT
        ELSE 'replay'::TEXT
      END,
      v_request.reservation_ids,
      v_request.response_status,
      v_request.response_body,
      v_request.response_headers;
    RETURN;
  END IF;

  -- Reapply compatibility for rows created by the early draft before aliases
  -- existed. Backfill the canonical key and preserve its original response.
  SELECT request.* INTO v_request
  FROM public.social_kit_requests AS request
  WHERE request.user_id = p_user_id
    AND request.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    INSERT INTO public.social_kit_request_keys (
      user_id,
      idempotency_key,
      request_id
    ) VALUES (
      p_user_id,
      p_idempotency_key,
      v_request.id
    )
    ON CONFLICT (user_id, idempotency_key) DO NOTHING;

    RETURN QUERY SELECT
      v_request.id,
      CASE
        WHEN v_request.request_hash != p_request_hash THEN 'conflict'::TEXT
        WHEN v_request.status = 'processing' THEN 'in_progress'::TEXT
        ELSE 'replay'::TEXT
      END,
      v_request.reservation_ids,
      v_request.response_status,
      v_request.response_body,
      v_request.response_headers;
    RETURN;
  END IF;

  -- The semantic advisory lock makes this active-row lookup authoritative for
  -- the current transaction. Bind the alternate key before completion can
  -- transition the request to a terminal state.
  SELECT request.* INTO v_request
  FROM public.social_kit_requests AS request
  WHERE request.user_id = p_user_id
    AND request.request_hash = p_request_hash
    AND request.status = 'processing'
  FOR UPDATE;

  IF FOUND THEN
    INSERT INTO public.social_kit_request_keys (
      user_id,
      idempotency_key,
      request_id
    ) VALUES (
      p_user_id,
      p_idempotency_key,
      v_request.id
    )
    ON CONFLICT (user_id, idempotency_key) DO NOTHING;

    SELECT request.* INTO v_request
    FROM public.social_kit_request_keys AS request_key
    JOIN public.social_kit_requests AS request
      ON request.id = request_key.request_id
     AND request.user_id = request_key.user_id
    WHERE request_key.user_id = p_user_id
      AND request_key.idempotency_key = p_idempotency_key;

    RETURN QUERY SELECT
      v_request.id,
      CASE
        WHEN v_request.request_hash != p_request_hash THEN 'conflict'::TEXT
        WHEN v_request.status = 'processing' THEN 'in_progress'::TEXT
        ELSE 'replay'::TEXT
      END,
      v_request.reservation_ids,
      v_request.response_status,
      v_request.response_body,
      v_request.response_headers;
    RETURN;
  END IF;

  -- A second tab can finish uploading just after the first tab has persisted
  -- its queue-accepted response. The active partial index is already released
  -- at that point even though the five child jobs are still running. Bind a
  -- different key to the recent canonical response for a short grace window;
  -- an intentional rerun becomes a new request after the window expires.
  SELECT request.* INTO v_request
  FROM public.social_kit_requests AS request
  WHERE request.user_id = p_user_id
    AND request.request_hash = p_request_hash
    AND request.status = 'succeeded'
    AND COALESCE(request.completed_at, request.updated_at)
        >= now() - INTERVAL '10 minutes'
  ORDER BY COALESCE(request.completed_at, request.updated_at) DESC,
           request.id DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.social_kit_request_keys (
      user_id,
      idempotency_key,
      request_id
    ) VALUES (
      p_user_id,
      p_idempotency_key,
      v_request.id
    )
    ON CONFLICT (user_id, idempotency_key) DO NOTHING;

    SELECT request.* INTO v_request
    FROM public.social_kit_request_keys AS request_key
    JOIN public.social_kit_requests AS request
      ON request.id = request_key.request_id
     AND request.user_id = request_key.user_id
    WHERE request_key.user_id = p_user_id
      AND request_key.idempotency_key = p_idempotency_key;

    RETURN QUERY SELECT
      v_request.id,
      CASE
        WHEN v_request.request_hash != p_request_hash THEN 'conflict'::TEXT
        WHEN v_request.status = 'processing' THEN 'in_progress'::TEXT
        ELSE 'replay'::TEXT
      END,
      v_request.reservation_ids,
      v_request.response_status,
      v_request.response_body,
      v_request.response_headers;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.social_kit_requests (
      user_id,
      idempotency_key,
      request_hash
    ) VALUES (
      p_user_id,
      p_idempotency_key,
      p_request_hash
    )
    RETURNING * INTO v_request;

    INSERT INTO public.social_kit_request_keys (
      user_id,
      idempotency_key,
      request_id
    ) VALUES (
      p_user_id,
      p_idempotency_key,
      v_request.id
    );

    RETURN QUERY SELECT
      v_request.id,
      'acquired'::TEXT,
      v_request.reservation_ids,
      v_request.response_status,
      v_request.response_body,
      v_request.response_headers;
    RETURN;
  EXCEPTION
    WHEN unique_violation THEN
      -- The user/key guard or the active semantic-request guard won the race.
      -- The subtransaction rolls back a request insert if the alias insert was
      -- the colliding statement.
      NULL;
  END;

  -- Resolve whichever request won the key or active semantic-hash race. If the
  -- active request terminalizes between the failed INSERT and this SELECT, it
  -- is still the newest same-hash row and the losing key remains bound to it.
  SELECT request.* INTO v_request
  FROM public.social_kit_request_keys AS request_key
  JOIN public.social_kit_requests AS request
    ON request.id = request_key.request_id
   AND request.user_id = request_key.user_id
  WHERE request_key.user_id = p_user_id
    AND request_key.idempotency_key = p_idempotency_key;

  IF NOT FOUND THEN
    SELECT request.* INTO v_request
    FROM public.social_kit_requests AS request
    WHERE request.user_id = p_user_id
      AND request.request_hash = p_request_hash
    ORDER BY request.created_at DESC, request.id DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'idempotency_claim_race';
    END IF;

    INSERT INTO public.social_kit_request_keys (
      user_id,
      idempotency_key,
      request_id
    ) VALUES (
      p_user_id,
      p_idempotency_key,
      v_request.id
    )
    ON CONFLICT (user_id, idempotency_key) DO NOTHING;

    -- Another concurrent claim may have bound this key first. Re-read the
    -- authoritative alias before deciding conflict/in-progress/replay.
    SELECT request.* INTO v_request
    FROM public.social_kit_request_keys AS request_key
    JOIN public.social_kit_requests AS request
      ON request.id = request_key.request_id
     AND request.user_id = request_key.user_id
    WHERE request_key.user_id = p_user_id
      AND request_key.idempotency_key = p_idempotency_key;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'idempotency_alias_race';
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_request.id,
    CASE
      WHEN v_request.request_hash != p_request_hash THEN 'conflict'::TEXT
      WHEN v_request.status = 'processing' THEN 'in_progress'::TEXT
      ELSE 'replay'::TEXT
    END,
    v_request.reservation_ids,
    v_request.response_status,
    v_request.response_body,
    v_request.response_headers;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.reserve_social_kit_request_bundle(
  p_request_id UUID,
  p_user_id UUID,
  p_amounts INTEGER[],
  p_descriptions TEXT[]
) RETURNS UUID[] AS $$
DECLARE
  v_status TEXT;
  v_reservation_ids UUID[];
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT request.status, request.reservation_ids
    INTO v_status, v_reservation_ids
  FROM public.social_kit_requests AS request
  WHERE request.id = p_request_id
    AND request.user_id = p_user_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'social_kit_request_not_found';
  END IF;

  IF v_status != 'processing' THEN
    RAISE EXCEPTION 'social_kit_request_not_processing';
  END IF;

  IF COALESCE(cardinality(v_reservation_ids), 0) > 0 THEN
    RETURN v_reservation_ids;
  END IF;

  SELECT public.reserve_credit_bundle(
    p_user_id,
    p_amounts,
    p_descriptions
  ) INTO v_reservation_ids;

  UPDATE public.social_kit_requests
  SET reservation_ids = v_reservation_ids,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN v_reservation_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

-- Remove the four-argument draft overload so it cannot retain an implicit
-- PUBLIC execute grant beside the final five-argument function.
DROP FUNCTION IF EXISTS public.complete_social_kit_request(
  UUID, UUID, INTEGER, JSONB
);

CREATE OR REPLACE FUNCTION public.complete_social_kit_request(
  p_request_id UUID,
  p_user_id UUID,
  p_response_status INTEGER,
  p_response_body JSONB,
  p_response_headers JSONB DEFAULT '{}'::JSONB
) RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
  v_request_hash TEXT;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_response_status IS NULL
     OR p_response_status < 100
     OR p_response_status > 599
     OR p_response_body IS NULL
     OR jsonb_typeof(p_response_body) != 'object'
     OR p_response_headers IS NULL
     OR jsonb_typeof(p_response_headers) != 'object'
     OR EXISTS (
       SELECT 1
       FROM jsonb_each(p_response_headers) AS header_row
       WHERE jsonb_typeof(header_row.value) IS DISTINCT FROM 'string'
     ) THEN
    RAISE EXCEPTION 'invalid_social_kit_response';
  END IF;

  SELECT request.request_hash INTO v_request_hash
  FROM public.social_kit_requests AS request
  WHERE request.id = p_request_id
    AND request.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::TEXT || ':' || v_request_hash,
      0
    )
  );

  UPDATE public.social_kit_requests
  SET status = CASE
        WHEN p_response_status BETWEEN 200 AND 299 THEN 'succeeded'
        ELSE 'failed'
      END,
      response_status = p_response_status,
      response_body = p_response_body,
      response_headers = p_response_headers,
      updated_at = now(),
      completed_at = now()
  WHERE id = p_request_id
    AND user_id = p_user_id
    AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

-- Commit the durable output, job terminal state, and reserved credit spend in
-- one database transaction. Both success and failure transitions lock rows in
-- the same jobs -> credit_transactions -> profiles order, eliminating webhook
-- versus stuck-job refund races.
CREATE OR REPLACE FUNCTION public.complete_job_output_and_spend(
  p_job_id UUID,
  p_fal_url TEXT,
  p_metadata JSONB
) RETURNS TABLE (
  disposition TEXT,
  output_id UUID,
  result_user_id UUID,
  result_project_id UUID,
  result_output_type TEXT,
  result_r2_url TEXT
) AS $$
DECLARE
  v_job RECORD;
  v_transaction RECORD;
  v_output RECORD;
  v_output_type TEXT;
  v_output_existed BOOLEAN := FALSE;
  v_repaired BOOLEAN := FALSE;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_fal_url IS NULL OR p_fal_url !~ '^https?://' THEN
    RAISE EXCEPTION 'invalid_output_url';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) != 'object' THEN
    RAISE EXCEPTION 'invalid_output_metadata';
  END IF;

  SELECT job.id,
         job.user_id,
         job.project_id,
         job.tool,
         job.status,
         job.credit_cost,
         job.credit_tx_id
    INTO STRICT v_job
  FROM public.jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF v_job.status IN ('failed', 'cancelled') THEN
    RETURN QUERY SELECT
      'terminal_conflict'::TEXT,
      NULL::UUID,
      v_job.user_id,
      v_job.project_id,
      NULL::TEXT,
      NULL::TEXT;
    RETURN;
  END IF;

  IF v_job.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = v_job.project_id
      AND project.user_id = v_job.user_id
  ) THEN
    RAISE EXCEPTION 'job_project_owner_mismatch';
  END IF;

  IF v_job.credit_tx_id IS NOT NULL THEN
    SELECT transaction_row.id,
           transaction_row.user_id,
           transaction_row.amount,
           transaction_row.type,
           transaction_row.status,
           transaction_row.job_id
      INTO STRICT v_transaction
    FROM public.credit_transactions AS transaction_row
    WHERE transaction_row.id = v_job.credit_tx_id
    FOR UPDATE;

    IF v_transaction.user_id IS DISTINCT FROM v_job.user_id
       OR (
         v_transaction.job_id IS NOT NULL
         AND v_transaction.job_id IS DISTINCT FROM p_job_id
       ) THEN
      RAISE EXCEPTION 'job_credit_transaction_mismatch';
    END IF;

    IF v_transaction.type IS DISTINCT FROM 'spend'
       OR v_transaction.amount >= 0
       OR ABS(v_transaction.amount) IS DISTINCT FROM v_job.credit_cost THEN
      RAISE EXCEPTION 'job_credit_transaction_amount_mismatch';
    END IF;

    IF v_transaction.status = 'refunded' THEN
      RETURN QUERY SELECT
        'terminal_conflict'::TEXT,
        NULL::UUID,
        v_job.user_id,
        v_job.project_id,
        NULL::TEXT,
        NULL::TEXT;
      RETURN;
    END IF;

    IF v_transaction.status NOT IN ('reserved', 'completed') THEN
      RAISE EXCEPTION 'invalid_credit_transaction_status';
    END IF;
  END IF;

  v_output_type := CASE
    WHEN v_job.tool = '3d-model' THEN 'glb'
    WHEN v_job.tool IN ('video', 'talking-avatar') THEN 'video'
    ELSE 'image'
  END;

  SELECT output_row.id,
         output_row.user_id,
         output_row.project_id,
         output_row.type,
         output_row.fal_url,
         output_row.r2_url
    INTO v_output
  FROM public.outputs AS output_row
  WHERE output_row.job_id = p_job_id
  FOR UPDATE;

  IF FOUND THEN
    v_output_existed := TRUE;
    IF v_output.user_id IS DISTINCT FROM v_job.user_id
       OR v_output.project_id IS DISTINCT FROM v_job.project_id
       OR v_output.type IS DISTINCT FROM v_output_type THEN
      RAISE EXCEPTION 'job_output_owner_mismatch';
    END IF;
    IF v_output.fal_url IS DISTINCT FROM p_fal_url THEN
      RETURN QUERY SELECT
        'payload_conflict'::TEXT,
        v_output.id,
        v_job.user_id,
        v_job.project_id,
        v_output_type,
        v_output.r2_url;
      RETURN;
    END IF;
  ELSE
    INSERT INTO public.outputs (
      job_id,
      user_id,
      project_id,
      type,
      fal_url,
      r2_url,
      file_size,
      metadata
    ) VALUES (
      p_job_id,
      v_job.user_id,
      v_job.project_id,
      v_output_type,
      p_fal_url,
      NULL,
      NULL,
      p_metadata
    )
    RETURNING id, user_id, project_id, type, fal_url, r2_url INTO v_output;
  END IF;

  IF v_job.credit_tx_id IS NOT NULL THEN
    IF v_transaction.status = 'reserved' THEN
      UPDATE public.credit_transactions
      SET status = 'completed',
          job_id = p_job_id
      WHERE id = v_job.credit_tx_id;
      v_repaired := v_job.status = 'completed';
    ELSIF v_transaction.status = 'completed'
          AND v_transaction.job_id IS NULL THEN
      UPDATE public.credit_transactions
      SET job_id = p_job_id
      WHERE id = v_job.credit_tx_id;
      v_repaired := TRUE;
    END IF;
  END IF;

  IF v_job.status != 'completed' THEN
    UPDATE public.jobs
    SET status = 'completed',
        error_message = NULL,
        completed_at = now()
    WHERE id = p_job_id;
  END IF;

  RETURN QUERY SELECT
    CASE
      WHEN v_repaired THEN 'repaired'::TEXT
      WHEN v_job.status = 'completed' OR v_output_existed
        THEN 'replayed'::TEXT
      ELSE 'completed'::TEXT
    END,
    v_output.id,
    v_job.user_id,
    v_job.project_id,
    v_output_type,
    v_output.r2_url;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.fail_job_and_refund(
  p_job_id UUID,
  p_error_message TEXT,
  p_stale_before TIMESTAMPTZ DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_job RECORD;
  v_transaction RECORD;
  v_output RECORD;
  v_output_type TEXT;
  v_refunded BOOLEAN := FALSE;
  v_was_failed BOOLEAN;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT job.id,
         job.user_id,
         job.project_id,
         job.tool,
         job.status,
         job.credit_cost,
         job.credit_tx_id,
         job.created_at,
         job.started_at
    INTO STRICT v_job
  FROM public.jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF v_job.status = 'completed' THEN
    RETURN 'already_completed';
  END IF;

  IF p_stale_before IS NOT NULL AND NOT (
    (v_job.status = 'pending' AND v_job.created_at < p_stale_before)
    OR
    (
      v_job.status = 'processing'
      AND COALESCE(v_job.started_at, v_job.created_at) < p_stale_before
    )
  ) THEN
    RETURN 'not_eligible';
  END IF;

  IF v_job.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = v_job.project_id
      AND project.user_id = v_job.user_id
  ) THEN
    RAISE EXCEPTION 'job_project_owner_mismatch';
  END IF;

  v_was_failed := v_job.status IN ('failed', 'cancelled');

  IF v_job.credit_tx_id IS NOT NULL THEN
    SELECT transaction_row.id,
           transaction_row.user_id,
           transaction_row.amount,
           transaction_row.type,
           transaction_row.status,
           transaction_row.job_id
      INTO STRICT v_transaction
    FROM public.credit_transactions AS transaction_row
    WHERE transaction_row.id = v_job.credit_tx_id
    FOR UPDATE;

    IF v_transaction.user_id IS DISTINCT FROM v_job.user_id
       OR (
         v_transaction.job_id IS NOT NULL
         AND v_transaction.job_id IS DISTINCT FROM p_job_id
       ) THEN
      RAISE EXCEPTION 'job_credit_transaction_mismatch';
    END IF;

    IF v_transaction.type IS DISTINCT FROM 'spend'
       OR v_transaction.amount >= 0
       OR ABS(v_transaction.amount) IS DISTINCT FROM v_job.credit_cost THEN
      RAISE EXCEPTION 'job_credit_transaction_amount_mismatch';
    END IF;
  END IF;

  -- A durable output is stronger evidence than a stale job snapshot. Repair
  -- legacy partial-success rows instead of refunding them. The transaction
  -- row is already locked, preserving the shared jobs -> transaction ->
  -- output lock order used by the success transition.
  v_output_type := CASE
    WHEN v_job.tool = '3d-model' THEN 'glb'
    WHEN v_job.tool IN ('video', 'talking-avatar') THEN 'video'
    ELSE 'image'
  END;

  SELECT output_row.id,
         output_row.user_id,
         output_row.project_id,
         output_row.type,
         output_row.fal_url,
         output_row.r2_url
    INTO v_output
  FROM public.outputs AS output_row
  WHERE output_row.job_id = p_job_id
  FOR UPDATE;

  IF FOUND AND v_job.status = 'cancelled' THEN
    -- Never refund a cancelled legacy row while retaining a durable output.
    -- Product policy must decide whether that output is deleted or charged.
    RETURN 'output_present';
  END IF;

  IF FOUND THEN
    IF v_output.user_id IS DISTINCT FROM v_job.user_id
       OR v_output.project_id IS DISTINCT FROM v_job.project_id
       OR v_output.type IS DISTINCT FROM v_output_type
       OR (v_output.fal_url IS NULL AND v_output.r2_url IS NULL) THEN
      RAISE EXCEPTION 'job_output_owner_mismatch';
    END IF;

    IF v_job.credit_tx_id IS NOT NULL THEN
      IF v_transaction.status = 'refunded' THEN
        RETURN 'output_present';
      ELSIF v_transaction.status = 'reserved' THEN
        UPDATE public.credit_transactions
        SET status = 'completed',
            job_id = p_job_id
        WHERE id = v_job.credit_tx_id;
      ELSIF v_transaction.status = 'completed'
            AND v_transaction.job_id IS NULL THEN
        UPDATE public.credit_transactions
        SET job_id = p_job_id
        WHERE id = v_job.credit_tx_id;
      ELSIF v_transaction.status != 'completed' THEN
        RAISE EXCEPTION 'invalid_credit_transaction_status';
      END IF;
    END IF;

    UPDATE public.jobs
    SET status = 'completed',
        error_message = NULL,
        completed_at = COALESCE(completed_at, now())
    WHERE id = p_job_id;

    RETURN 'output_repaired';
  END IF;

  IF v_job.credit_tx_id IS NOT NULL THEN
    IF v_transaction.status = 'completed' THEN
      RAISE EXCEPTION 'job_ledger_conflict';
    END IF;

    IF v_transaction.status = 'reserved' THEN
      UPDATE public.profiles
      SET credit_balance = credit_balance + ABS(v_transaction.amount),
          updated_at = now()
      WHERE id = v_job.user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'job_user_not_found';
      END IF;

      UPDATE public.credit_transactions
      SET status = 'refunded',
          job_id = COALESCE(job_id, p_job_id)
      WHERE id = v_job.credit_tx_id;
      v_refunded := TRUE;
    ELSIF v_transaction.status != 'refunded' THEN
      RAISE EXCEPTION 'invalid_credit_transaction_status';
    END IF;
  END IF;

  IF v_job.status != 'cancelled' THEN
    UPDATE public.jobs
    SET status = 'failed',
        error_message = LEFT(
          COALESCE(NULLIF(p_error_message, ''), 'Unknown provider error'),
          1000
        ),
        completed_at = COALESCE(completed_at, now())
    WHERE id = p_job_id;
  END IF;

  RETURN CASE
    WHEN v_was_failed AND NOT v_refunded THEN 'already_failed_refunded'
    WHEN v_refunded THEN 'failed_refunded'
    ELSE 'failed_no_charge'
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

-- This transition is retained only for repairing rows that are already in the
-- legacy terminal `cancelled` state. Active provider jobs must first obtain
-- definitive terminal evidence; a 202 cancellation acknowledgement alone can
-- never authorize this refund.
DROP FUNCTION IF EXISTS public.cancel_job_and_refund(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.cancel_job_and_refund(
  p_job_id UUID,
  p_reason TEXT,
  p_expected_fal_request_id TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_job RECORD;
  v_transaction RECORD;
  v_refunded BOOLEAN := FALSE;
  v_was_cancelled BOOLEAN;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT job.id,
         job.user_id,
         job.status,
         job.credit_cost,
         job.credit_tx_id,
         job.fal_request_id
    INTO STRICT v_job
  FROM public.jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF v_job.status = 'completed' THEN
    RETURN 'already_completed';
  END IF;

  IF v_job.status != 'cancelled' THEN
    RETURN 'not_cancellable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.outputs AS output_row
    WHERE output_row.job_id = p_job_id
  ) THEN
    RETURN 'output_present';
  END IF;

  v_was_cancelled := v_job.status = 'cancelled';

  IF v_job.credit_tx_id IS NOT NULL THEN
    SELECT transaction_row.id,
           transaction_row.user_id,
           transaction_row.amount,
           transaction_row.type,
           transaction_row.status,
           transaction_row.job_id
      INTO STRICT v_transaction
    FROM public.credit_transactions AS transaction_row
    WHERE transaction_row.id = v_job.credit_tx_id
    FOR UPDATE;

    IF v_transaction.user_id IS DISTINCT FROM v_job.user_id
       OR (
         v_transaction.job_id IS NOT NULL
         AND v_transaction.job_id IS DISTINCT FROM p_job_id
       ) THEN
      RAISE EXCEPTION 'job_credit_transaction_mismatch';
    END IF;

    IF v_transaction.type IS DISTINCT FROM 'spend'
       OR v_transaction.amount >= 0
       OR ABS(v_transaction.amount) IS DISTINCT FROM v_job.credit_cost THEN
      RAISE EXCEPTION 'job_credit_transaction_amount_mismatch';
    END IF;

    IF v_transaction.status = 'completed' THEN
      RAISE EXCEPTION 'job_ledger_conflict';
    ELSIF v_transaction.status = 'reserved' THEN
      UPDATE public.profiles
      SET credit_balance = credit_balance + ABS(v_transaction.amount),
          updated_at = now()
      WHERE id = v_job.user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'job_user_not_found';
      END IF;

      UPDATE public.credit_transactions
      SET status = 'refunded',
          job_id = COALESCE(job_id, p_job_id)
      WHERE id = v_job.credit_tx_id;
      v_refunded := TRUE;
    ELSIF v_transaction.status != 'refunded' THEN
      RAISE EXCEPTION 'invalid_credit_transaction_status';
    END IF;
  END IF;

  UPDATE public.jobs
  SET status = 'cancelled',
      error_message = LEFT(
        COALESCE(NULLIF(p_reason, ''), 'Cancelled by user'),
        1000
      ),
      completed_at = COALESCE(completed_at, now())
  WHERE id = p_job_id;

  RETURN CASE
    WHEN v_refunded THEN 'cancelled_refunded'
    WHEN v_was_cancelled THEN 'already_cancelled_refunded'
    ELSE 'cancelled_no_charge'
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

CREATE OR REPLACE FUNCTION public.take_maintenance_scan_page(
  p_scan_name TEXT,
  p_cutoff TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 50
) RETURNS JSONB AS $$
DECLARE
  v_cursor_created_at TIMESTAMPTZ;
  v_cursor_id TEXT;
  v_high_water_created_at TIMESTAMPTZ;
  v_high_water_id TEXT;
  v_rows JSONB := '[]'::JSONB;
  v_count INTEGER := 0;
  v_last_created_at TIMESTAMPTZ;
  v_last_id TEXT;
  v_cycle_complete BOOLEAN := FALSE;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_scan_name IS NULL OR p_scan_name NOT IN (
    'stuck_jobs',
    'reserved_transactions',
    'social_kit_requests'
  ) THEN
    RAISE EXCEPTION 'invalid_maintenance_scan';
  END IF;

  IF p_cutoff IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_maintenance_scan_page';
  END IF;

  INSERT INTO public.maintenance_scan_cursors (scan_name)
  VALUES (p_scan_name)
  ON CONFLICT (scan_name) DO NOTHING;

  SELECT cursor.cursor_created_at,
         cursor.cursor_id,
         cursor.high_water_created_at,
         cursor.high_water_id
    INTO STRICT v_cursor_created_at,
                v_cursor_id,
                v_high_water_created_at,
                v_high_water_id
  FROM public.maintenance_scan_cursors AS cursor
  WHERE cursor.scan_name = p_scan_name
  FOR UPDATE;

  IF v_high_water_created_at IS NULL THEN
    CASE p_scan_name
      WHEN 'stuck_jobs' THEN
        SELECT job.created_at, job.id::TEXT
          INTO v_high_water_created_at, v_high_water_id
        FROM public.jobs AS job
        WHERE job.status IN ('processing', 'pending')
          AND job.created_at < p_cutoff
        ORDER BY job.created_at DESC, job.id::TEXT DESC
        LIMIT 1;
      WHEN 'reserved_transactions' THEN
        SELECT transaction_row.created_at, transaction_row.id::TEXT
          INTO v_high_water_created_at, v_high_water_id
        FROM public.credit_transactions AS transaction_row
        WHERE transaction_row.status = 'reserved'
          AND transaction_row.created_at < p_cutoff
        ORDER BY transaction_row.created_at DESC, transaction_row.id::TEXT DESC
        LIMIT 1;
      WHEN 'social_kit_requests' THEN
        SELECT request.created_at, request.id::TEXT
          INTO v_high_water_created_at, v_high_water_id
        FROM public.social_kit_requests AS request
        WHERE request.status = 'processing'
          AND request.created_at < p_cutoff
        ORDER BY request.created_at DESC, request.id::TEXT DESC
        LIMIT 1;
    END CASE;

    IF v_high_water_created_at IS NULL THEN
      RETURN jsonb_build_object(
        'rows', '[]'::JSONB,
        'cycleComplete', TRUE,
        'scanTruncated', FALSE
      );
    END IF;

    UPDATE public.maintenance_scan_cursors
    SET high_water_created_at = v_high_water_created_at,
        high_water_id = v_high_water_id,
        updated_at = now()
    WHERE scan_name = p_scan_name;
  END IF;

  CASE p_scan_name
    WHEN 'stuck_jobs' THEN
      WITH page AS (
        SELECT job.id,
               job.user_id,
               job.model_id,
               job.status,
               job.credit_tx_id,
               job.fal_request_id,
               job.original_request,
               job.created_at
        FROM public.jobs AS job
        WHERE job.status IN ('processing', 'pending')
          AND job.created_at < p_cutoff
          AND (
            v_cursor_created_at IS NULL
            OR (job.created_at, job.id::TEXT) >
               (v_cursor_created_at, v_cursor_id)
          )
          AND (job.created_at, job.id::TEXT) <=
              (v_high_water_created_at, v_high_water_id)
        ORDER BY job.created_at, job.id::TEXT
        LIMIT p_limit
      )
      SELECT COALESCE(
               jsonb_agg(to_jsonb(page) ORDER BY page.created_at, page.id::TEXT),
               '[]'::JSONB
             ),
             count(*)::INTEGER,
             (array_agg(page.created_at ORDER BY page.created_at DESC, page.id::TEXT DESC))[1],
             (array_agg(page.id::TEXT ORDER BY page.created_at DESC, page.id::TEXT DESC))[1]
        INTO v_rows, v_count, v_last_created_at, v_last_id
      FROM page;
    WHEN 'reserved_transactions' THEN
      WITH page AS (
        SELECT transaction_row.id,
               transaction_row.user_id,
               transaction_row.type,
               transaction_row.amount,
               transaction_row.created_at
        FROM public.credit_transactions AS transaction_row
        WHERE transaction_row.status = 'reserved'
          AND transaction_row.created_at < p_cutoff
          AND (
            v_cursor_created_at IS NULL
            OR (transaction_row.created_at, transaction_row.id::TEXT) >
               (v_cursor_created_at, v_cursor_id)
          )
          AND (transaction_row.created_at, transaction_row.id::TEXT) <=
              (v_high_water_created_at, v_high_water_id)
        ORDER BY transaction_row.created_at, transaction_row.id::TEXT
        LIMIT p_limit
      )
      SELECT COALESCE(
               jsonb_agg(to_jsonb(page) ORDER BY page.created_at, page.id::TEXT),
               '[]'::JSONB
             ),
             count(*)::INTEGER,
             (array_agg(page.created_at ORDER BY page.created_at DESC, page.id::TEXT DESC))[1],
             (array_agg(page.id::TEXT ORDER BY page.created_at DESC, page.id::TEXT DESC))[1]
        INTO v_rows, v_count, v_last_created_at, v_last_id
      FROM page;
    WHEN 'social_kit_requests' THEN
      WITH page AS (
        SELECT request.id,
               request.user_id,
               request.reservation_ids,
               request.created_at
        FROM public.social_kit_requests AS request
        WHERE request.status = 'processing'
          AND request.created_at < p_cutoff
          AND (
            v_cursor_created_at IS NULL
            OR (request.created_at, request.id::TEXT) >
               (v_cursor_created_at, v_cursor_id)
          )
          AND (request.created_at, request.id::TEXT) <=
              (v_high_water_created_at, v_high_water_id)
        ORDER BY request.created_at, request.id::TEXT
        LIMIT p_limit
      )
      SELECT COALESCE(
               jsonb_agg(to_jsonb(page) ORDER BY page.created_at, page.id::TEXT),
               '[]'::JSONB
             ),
             count(*)::INTEGER,
             (array_agg(page.created_at ORDER BY page.created_at DESC, page.id::TEXT DESC))[1],
             (array_agg(page.id::TEXT ORDER BY page.created_at DESC, page.id::TEXT DESC))[1]
        INTO v_rows, v_count, v_last_created_at, v_last_id
      FROM page;
  END CASE;

  IF v_count = 0 THEN
    UPDATE public.maintenance_scan_cursors
    SET cursor_created_at = NULL,
        cursor_id = NULL,
        high_water_created_at = NULL,
        high_water_id = NULL,
        updated_at = now()
    WHERE scan_name = p_scan_name;

    RETURN jsonb_build_object(
      'rows', '[]'::JSONB,
      'cycleComplete', TRUE,
      'scanTruncated', FALSE
    );
  END IF;

  v_cycle_complete :=
    v_count < p_limit
    OR (v_last_created_at, v_last_id) >=
       (v_high_water_created_at, v_high_water_id);

  UPDATE public.maintenance_scan_cursors
  SET cursor_created_at = CASE
        WHEN v_cycle_complete THEN NULL
        ELSE v_last_created_at
      END,
      cursor_id = CASE WHEN v_cycle_complete THEN NULL ELSE v_last_id END,
      high_water_created_at = CASE
        WHEN v_cycle_complete THEN NULL
        ELSE v_high_water_created_at
      END,
      high_water_id = CASE
        WHEN v_cycle_complete THEN NULL
        ELSE v_high_water_id
      END,
      updated_at = now()
  WHERE scan_name = p_scan_name;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'cycleComplete', v_cycle_complete,
    'scanTruncated', NOT v_cycle_complete
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL ON FUNCTION public.claim_social_kit_request(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_social_kit_request_bundle(
  UUID, UUID, INTEGER[], TEXT[]
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_social_kit_request(
  UUID, UUID, INTEGER, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_job_output_and_spend(
  UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_job_and_refund(
  UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_job_and_refund(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.take_maintenance_scan_page(
  TEXT, TIMESTAMPTZ, INTEGER
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_social_kit_request(UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_social_kit_request_bundle(
  UUID, UUID, INTEGER[], TEXT[]
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_social_kit_request(
  UUID, UUID, INTEGER, JSONB, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_job_output_and_spend(
  UUID, TEXT, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_job_and_refund(
  UUID, TEXT, TIMESTAMPTZ
) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_job_and_refund(UUID, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.take_maintenance_scan_page(
  TEXT, TIMESTAMPTZ, INTEGER
) TO service_role;
