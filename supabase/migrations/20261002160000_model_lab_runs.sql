-- Admin Model Lab experiment history.
--
-- Rows are written and read only by the admin API through the service role.
-- RLS is enabled with no client policies, so anon and authenticated sessions
-- see nothing; ownership is enforced by the API filtering on user_id.
--
-- A row is inserted BEFORE the provider submit. The unique client request id
-- makes a retried submit return the existing run instead of paying twice; a
-- row stuck in 'submitting' or 'unknown' is never resubmitted automatically.
-- Deleting a run (by the admin, or 30 days after it started) removes its
-- files and content but keeps the row as a tombstone (deleted_at), so the
-- same client request id can never pay again. The API cannot hard-delete
-- rows: the service role has no DELETE privilege on this table.
--
-- Copying a finished run's outputs into storage is guarded by a short lease
-- (storage_lease_until): only the request holding it may write progress.
--
-- model_lab_input_deletions records lab uploads being or already deleted. A
-- delete writes its claim before checking whether any run uses the file; a
-- submit records its run before checking for claims. Whichever comes second
-- sees the other, so a file is never deleted under a run that is about to be
-- paid for.
--
-- Safe to apply more than once.

CREATE TABLE IF NOT EXISTS public.model_lab_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_request_id UUID NOT NULL,
  model_key TEXT NOT NULL CHECK (char_length(model_key) BETWEEN 1 AND 128),
  endpoint TEXT NOT NULL CHECK (char_length(endpoint) BETWEEN 1 AND 512),
  status TEXT NOT NULL CHECK (status IN ('submitting', 'queued', 'running', 'completed', 'failed', 'unknown')),
  request_id TEXT CHECK (request_id IS NULL OR char_length(request_id) BETWEEN 1 AND 512),
  receipt TEXT CHECK (receipt IS NULL OR char_length(receipt) <= 4096),
  inputs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(inputs) = 'array'),
  outputs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(outputs) = 'array'),
  storage_state TEXT NOT NULL DEFAULT 'none'
    CHECK (storage_state IN ('none', 'pending', 'stored', 'partial', 'failed')),
  storage_lease_until TIMESTAMPTZ,
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) <= 64),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT model_lab_runs_client_request_unique UNIQUE (user_id, client_request_id),
  -- A run the provider accepted can always be polled again.
  CONSTRAINT model_lab_runs_tracked_request
    CHECK (status NOT IN ('queued', 'running') OR (request_id IS NOT NULL AND receipt IS NOT NULL)),
  -- A tombstone keeps only what blocks a second charge: no content, no receipt.
  CONSTRAINT model_lab_runs_tombstone
    CHECK (deleted_at IS NULL OR (
      inputs = '[]'::jsonb AND outputs = '[]'::jsonb AND receipt IS NULL AND error_message IS NULL
      AND storage_state = 'none' AND storage_lease_until IS NULL
      AND status IN ('completed', 'failed', 'unknown')
    ))
);

CREATE INDEX IF NOT EXISTS idx_model_lab_runs_user_created
  ON public.model_lab_runs (user_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_model_lab_runs_expires
  ON public.model_lab_runs (expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_model_lab_runs_user_request
  ON public.model_lab_runs (user_id, request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.model_lab_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.model_lab_runs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.model_lab_runs TO service_role;

CREATE TABLE IF NOT EXISTS public.model_lab_input_deletions (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  path TEXT NOT NULL CHECK (char_length(path) BETWEEN 1 AND 1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, path)
);

ALTER TABLE public.model_lab_input_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.model_lab_input_deletions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.model_lab_input_deletions TO service_role;
