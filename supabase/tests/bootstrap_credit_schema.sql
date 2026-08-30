\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

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

GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.credit_transactions TO service_role;
