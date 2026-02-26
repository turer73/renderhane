-- Users profile (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  locale TEXT DEFAULT 'tr' CHECK (locale IN ('tr', 'en')),
  credit_balance INTEGER DEFAULT 20 NOT NULL CHECK (credit_balance >= 0),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Credit transactions (every spend/purchase/refund)
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('purchase', 'spend', 'refund', 'bonus')),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('reserved', 'completed', 'refunded')),
  description TEXT,
  job_id UUID,
  payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Projects (organize outputs by product)
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_image_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Jobs (fal.ai requests)
CREATE TABLE public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  tool TEXT NOT NULL CHECK (tool IN ('3d-model', 'bg-remove', 'enhance', 'scene', 'video', 'aplus')),
  model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  fal_request_id TEXT,
  input_params JSONB DEFAULT '{}',
  credit_cost INTEGER NOT NULL,
  credit_tx_id UUID REFERENCES public.credit_transactions(id),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Outputs (generated assets)
CREATE TABLE public.outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('glb', 'image', 'video')),
  fal_url TEXT,
  r2_url TEXT,
  file_size INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Add deferred FK for circular dependency
ALTER TABLE public.credit_transactions
  ADD CONSTRAINT fk_credit_transactions_job
  FOREIGN KEY (job_id) REFERENCES public.jobs(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- Indexes
CREATE INDEX idx_credit_transactions_user ON public.credit_transactions(user_id);
CREATE INDEX idx_projects_user ON public.projects(user_id);
CREATE INDEX idx_jobs_user_status ON public.jobs(user_id, status);
CREATE INDEX idx_jobs_fal_request ON public.jobs(fal_request_id);
CREATE INDEX idx_outputs_job ON public.outputs(job_id);
CREATE INDEX idx_outputs_user ON public.outputs(user_id);

-- RLS Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outputs ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own data
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users read own transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users read own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users read own jobs" ON public.jobs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users read own outputs" ON public.outputs FOR SELECT USING (auth.uid() = user_id);

-- Service role can manage all tables (for API routes, webhooks)
CREATE POLICY "Service role full access profiles" ON public.profiles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access credit_transactions" ON public.credit_transactions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access jobs" ON public.jobs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access outputs" ON public.outputs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can insert their own jobs (when submitting from client)
CREATE POLICY "Users insert own jobs" ON public.jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can insert their own profiles (fallback if trigger fails)
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, credit_balance)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    20
  );

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 20, 'bonus', 'Welcome bonus - 20 free credits');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, auth;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Atomic credit reservation (prevents double-spending race condition)
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT
) RETURNS UUID AS $$
DECLARE
  v_tx_id UUID;
  v_balance INTEGER;
BEGIN
  -- Lock the profile row to prevent concurrent deductions
  SELECT credit_balance INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  -- Deduct balance atomically
  UPDATE public.profiles
    SET credit_balance = credit_balance - p_amount,
        updated_at = now()
    WHERE id = p_user_id;

  -- Create reserved transaction
  INSERT INTO public.credit_transactions
    (user_id, amount, type, status, description)
  VALUES
    (p_user_id, -p_amount, 'spend', 'reserved', p_description)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

-- Enable realtime for jobs table (for live status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
