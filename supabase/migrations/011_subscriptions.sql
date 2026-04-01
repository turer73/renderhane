-- Subscription system for recurring monthly payments
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_key TEXT NOT NULL,           -- 'monthly' from PACKAGES
  status TEXT NOT NULL DEFAULT 'active',
  -- CHECK (status IN ('active', 'cancelled', 'expired', 'past_due'))
  credits_per_period INTEGER NOT NULL, -- e.g. 50
  price_per_period INTEGER NOT NULL,   -- e.g. 99 (kuruş değil, TL)
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  next_payment_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_next_payment ON subscriptions (next_payment_at)
  WHERE status = 'active';

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Only server (service role) can insert/update subscriptions
-- No INSERT/UPDATE policies for authenticated users

-- Function to renew a subscription after payment
CREATE OR REPLACE FUNCTION renew_subscription(
  p_subscription_id UUID,
  p_payment_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  SELECT * INTO v_sub
  FROM public.subscriptions
  WHERE id = p_subscription_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found or not active';
  END IF;

  -- Add credits
  UPDATE public.profiles
  SET credit_balance = credit_balance + v_sub.credits_per_period
  WHERE id = v_sub.user_id;

  -- Log transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, description, payment_id)
  VALUES (
    v_sub.user_id,
    v_sub.credits_per_period,
    'purchase',
    'Subscription renewal — ' || v_sub.package_key,
    p_payment_id
  );

  -- Update subscription period
  UPDATE public.subscriptions
  SET
    current_period_start = now(),
    current_period_end = now() + INTERVAL '30 days',
    next_payment_at = now() + INTERVAL '30 days',
    updated_at = now()
  WHERE id = p_subscription_id;
END;
$$;
