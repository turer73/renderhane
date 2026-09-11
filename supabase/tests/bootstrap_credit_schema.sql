\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  credit_balance INTEGER NOT NULL CHECK (credit_balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'spend', 'refund', 'bonus')),
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('reserved', 'completed', 'refunded')),
  description TEXT,
  job_id UUID,
  payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  tool TEXT NOT NULL,
  model_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  fal_request_id TEXT,
  input_params JSONB NOT NULL DEFAULT '{}'::JSONB,
  original_request JSONB,
  credit_cost INTEGER NOT NULL DEFAULT 0 CHECK (credit_cost >= 0),
  credit_tx_id UUID REFERENCES public.credit_transactions(id),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL UNIQUE REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('glb', 'image', 'video')),
  fal_url TEXT,
  r2_url TEXT,
  file_size INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.credit_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.projects TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.jobs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.outputs TO service_role;

-- Simulate the two signatures from the unreleased first draft. The final
-- migration must upgrade this state transactionally instead of assuming only
-- a pristine database.
CREATE FUNCTION public.claim_social_kit_request(UUID, TEXT, TEXT)
RETURNS TABLE (
  request_id UUID,
  disposition TEXT,
  reservation_ids UUID[],
  response_status INTEGER,
  response_body JSONB
) LANGUAGE SQL AS $$
  SELECT NULL::UUID, NULL::TEXT, NULL::UUID[], NULL::INTEGER, NULL::JSONB
$$;

CREATE FUNCTION public.complete_social_kit_request(
  UUID, UUID, INTEGER, JSONB
) RETURNS BOOLEAN LANGUAGE SQL AS $$
  SELECT FALSE
$$;
