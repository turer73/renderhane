-- Admin Model Lab experiment history.
--
-- Rows are written and read only by the admin API through the service role.
-- RLS is enabled with no client policies, so anon and authenticated sessions
-- see nothing; ownership is enforced by the API filtering on user_id.
--
-- A row is inserted BEFORE the provider submit. The unique client request id
-- makes a retried submit return the existing run instead of paying twice; a
-- row stuck in 'submitting' or 'unknown' is never resubmitted automatically.
-- Rows expire after 30 days; the API deletes expired rows and their stored
-- files when it lists history. Safe to apply more than once.

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
  error_code TEXT CHECK (error_code IS NULL OR char_length(error_code) <= 64),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  CONSTRAINT model_lab_runs_client_request_unique UNIQUE (user_id, client_request_id),
  -- A run the provider accepted can always be polled again.
  CONSTRAINT model_lab_runs_tracked_request
    CHECK (status NOT IN ('queued', 'running') OR (request_id IS NOT NULL AND receipt IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_model_lab_runs_user_created
  ON public.model_lab_runs (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_model_lab_runs_expires
  ON public.model_lab_runs (expires_at);

ALTER TABLE public.model_lab_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.model_lab_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.model_lab_runs TO service_role;
