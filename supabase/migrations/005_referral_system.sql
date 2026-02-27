-- supabase/migrations/005_referral_system.sql

-- ============================================================
-- 1. Add referral columns to profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS unlimited_bg_remove BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS free_bg_remove_daily INTEGER DEFAULT 3 NOT NULL,
  ADD COLUMN IF NOT EXISTS free_bg_remove_used INTEGER DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS free_bg_remove_date DATE DEFAULT CURRENT_DATE NOT NULL;

-- ============================================================
-- 2. Generate referral codes for existing users
-- ============================================================
UPDATE public.profiles
  SET referral_code = upper(substr(md5(id::text || now()::text), 1, 8))
  WHERE referral_code IS NULL;

-- ============================================================
-- 3. Create referrals table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  referee_email TEXT,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  referrer_reward INTEGER DEFAULT 10 NOT NULL,
  referee_reward INTEGER DEFAULT 5 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_referral_referee UNIQUE (referral_code, referee_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_email ON public.referrals(referee_email);

-- RLS
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id);
CREATE POLICY "Service role full access referrals" ON public.referrals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 4. Generate referral code on new user signup (replaces existing)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_ref_code TEXT;
  v_attempts INTEGER := 0;
BEGIN
  -- Generate unique 8-char referral code with collision retry
  LOOP
    v_ref_code := upper(substr(md5(NEW.id::text || now()::text || random()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_ref_code);
    v_attempts := v_attempts + 1;
    IF v_attempts > 10 THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after 10 attempts';
    END IF;
  END LOOP;

  INSERT INTO public.profiles (id, display_name, avatar_url, credit_balance, referral_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    20,
    v_ref_code
  );

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 20, 'bonus', 'Welcome bonus - 20 free credits');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, auth;

-- ============================================================
-- 5. Complete referral RPC (called after referee signs up)
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_referral(
  p_referral_code TEXT,
  p_referee_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_referrer_id UUID;
  v_referrer_count INTEGER;
  v_referrer_reward INTEGER;
  v_referee_reward INTEGER;
BEGIN
  -- Guard: verify referee profile exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_referee_id) THEN
    RETURN FALSE;
  END IF;

  -- Find pending referral by code
  SELECT r.referrer_id, r.referrer_reward, r.referee_reward
    INTO v_referrer_id, v_referrer_reward, v_referee_reward
    FROM public.referrals r
    WHERE r.referral_code = p_referral_code
      AND r.status = 'pending'
      AND r.referee_id IS NULL
    ORDER BY r.created_at DESC
    LIMIT 1
    FOR UPDATE;

  -- Guard: block self-referral (check both paths)
  IF v_referrer_id = p_referee_id THEN
    RETURN FALSE;
  END IF;

  -- If no pending referral found, check if there's a profile with this code
  -- (direct link referral without email invite)
  IF v_referrer_id IS NULL THEN
    SELECT id INTO v_referrer_id
      FROM public.profiles
      WHERE referral_code = p_referral_code
        AND id != p_referee_id;

    IF v_referrer_id IS NULL THEN
      RETURN FALSE;
    END IF;

    v_referrer_reward := 10;
    v_referee_reward := 5;

    -- Use ON CONFLICT to prevent double-credit from concurrent calls
    INSERT INTO public.referrals (referrer_id, referee_id, referee_email, referral_code, status, referrer_reward, referee_reward, completed_at)
    VALUES (v_referrer_id, p_referee_id, NULL, p_referral_code, 'completed', v_referrer_reward, v_referee_reward, now())
    ON CONFLICT (referral_code, referee_id) DO NOTHING;

    IF NOT FOUND THEN
      RETURN FALSE; -- Already completed (concurrent call)
    END IF;
  ELSE
    UPDATE public.referrals
      SET referee_id = p_referee_id,
          status = 'completed',
          completed_at = now()
      WHERE referral_code = p_referral_code
        AND status = 'pending'
        AND referee_id IS NULL;

    IF NOT FOUND THEN
      RETURN FALSE; -- concurrent call already completed this referral
    END IF;
  END IF;

  -- Check referrer's current count (max 5 rewards)
  SELECT referral_count INTO v_referrer_count
    FROM public.profiles WHERE id = v_referrer_id FOR UPDATE;

  IF v_referrer_count < 5 THEN
    UPDATE public.profiles
      SET credit_balance = credit_balance + v_referrer_reward,
          referral_count = referral_count + 1,
          unlimited_bg_remove = TRUE,
          updated_at = now()
      WHERE id = v_referrer_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (v_referrer_id, v_referrer_reward, 'bonus', 'Referral bonus — friend joined');
  END IF;

  -- Reward referee
  UPDATE public.profiles
    SET credit_balance = credit_balance + v_referee_reward,
        unlimited_bg_remove = TRUE,
        updated_at = now()
    WHERE id = p_referee_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (p_referee_id, v_referee_reward, 'bonus', 'Referral welcome bonus');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 6. Check free bg-remove eligibility RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_free_bg_remove(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_unlimited BOOLEAN;
  v_daily_limit INTEGER;
  v_used INTEGER;
  v_last_date DATE;
BEGIN
  SELECT unlimited_bg_remove, free_bg_remove_daily, free_bg_remove_used, free_bg_remove_date
    INTO v_unlimited, v_daily_limit, v_used, v_last_date
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_unlimited THEN
    RETURN TRUE;
  END IF;

  -- Reset daily counter if new day
  IF v_last_date < CURRENT_DATE THEN
    v_used := 0;
  END IF;

  IF v_used < v_daily_limit THEN
    -- Single atomic UPDATE: reset date if needed + increment usage
    UPDATE public.profiles
      SET free_bg_remove_used = v_used + 1,
          free_bg_remove_date = CURRENT_DATE
      WHERE id = p_user_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
