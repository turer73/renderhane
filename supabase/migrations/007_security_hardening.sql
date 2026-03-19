-- 007_security_hardening.sql
-- Fixes: SECURITY DEFINER auth bypass, health monitoring RLS, referral race condition

-- ============================================================
-- 1. reserve_credits: add auth.uid() check
-- ============================================================
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT
) RETURNS UUID AS $$
DECLARE
  v_tx_id UUID;
  v_balance INTEGER;
BEGIN
  -- Auth guard: only service_role or the user themselves can reserve
  IF current_setting('role', true) != 'service_role' AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

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

  UPDATE public.profiles
    SET credit_balance = credit_balance - p_amount,
        updated_at = now()
    WHERE id = p_user_id;

  INSERT INTO public.credit_transactions
    (user_id, amount, type, status, description)
  VALUES
    (p_user_id, -p_amount, 'spend', 'reserved', p_description)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public;

-- ============================================================
-- 2. refund_credits: add service_role-only check
-- ============================================================
CREATE OR REPLACE FUNCTION public.refund_credits(p_tx_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_amount INTEGER;
BEGIN
  -- Only service_role can issue refunds (webhooks, admin)
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
    FROM public.credit_transactions
    WHERE id = p_tx_id AND status = 'reserved'
    FOR UPDATE;

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
    SET credit_balance = credit_balance + ABS(v_amount),
        updated_at = now()
    WHERE id = v_user_id;

  UPDATE public.credit_transactions
    SET status = 'refunded'
    WHERE id = p_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 3. add_credits: add service_role-only check
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_payment_id TEXT,
  p_description TEXT
) RETURNS UUID AS $$
DECLARE
  v_tx_id UUID;
  v_balance INTEGER;
BEGIN
  -- Only service_role can add credits (payment webhooks, admin)
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT credit_balance INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  UPDATE public.profiles
    SET credit_balance = credit_balance + p_amount,
        updated_at = now()
    WHERE id = p_user_id;

  INSERT INTO public.credit_transactions
    (user_id, amount, type, status, description, payment_id)
  VALUES
    (p_user_id, p_amount, 'purchase', 'completed', p_description, p_payment_id)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 4. confirm_spend: add service_role-only check
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_spend(
  p_tx_id UUID,
  p_job_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.credit_transactions
    SET status = 'completed', job_id = p_job_id
    WHERE id = p_tx_id AND status = 'reserved';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 5. complete_referral: add auth.uid() == p_referee_id check
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
  -- Auth guard: only service_role or the referee themselves
  IF current_setting('role', true) != 'service_role' AND auth.uid() != p_referee_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_referee_id) THEN
    RETURN FALSE;
  END IF;

  SELECT r.referrer_id, r.referrer_reward, r.referee_reward
    INTO v_referrer_id, v_referrer_reward, v_referee_reward
    FROM public.referrals r
    WHERE r.referral_code = p_referral_code
      AND r.status = 'pending'
      AND r.referee_id IS NULL
    ORDER BY r.created_at DESC
    LIMIT 1
    FOR UPDATE;

  IF v_referrer_id = p_referee_id THEN
    RETURN FALSE;
  END IF;

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

    INSERT INTO public.referrals (referrer_id, referee_id, referee_email, referral_code, status, referrer_reward, referee_reward, completed_at)
    VALUES (v_referrer_id, p_referee_id, NULL, p_referral_code, 'completed', v_referrer_reward, v_referee_reward, now())
    ON CONFLICT (referral_code, referee_id) DO NOTHING;

    IF NOT FOUND THEN
      RETURN FALSE;
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
      RETURN FALSE;
    END IF;
  END IF;

  -- Lock referrer row and check count atomically
  SELECT referral_count INTO v_referrer_count
    FROM public.profiles WHERE id = v_referrer_id FOR UPDATE;

  IF v_referrer_count < 5 THEN
    UPDATE public.profiles
      SET credit_balance = credit_balance + v_referrer_reward,
          referral_count = referral_count + 1,
          unlimited_bg_remove = TRUE,
          updated_at = now()
      WHERE id = v_referrer_id
        AND referral_count < 5; -- Double-check in WHERE to prevent race

    IF FOUND THEN
      INSERT INTO public.credit_transactions (user_id, amount, type, description)
      VALUES (v_referrer_id, v_referrer_reward, 'bonus', 'Referral bonus — friend joined');
    END IF;
  END IF;

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
-- 6. check_free_bg_remove: add auth.uid() check
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_free_bg_remove(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_unlimited BOOLEAN;
  v_daily_limit INTEGER;
  v_used INTEGER;
  v_last_date DATE;
BEGIN
  IF current_setting('role', true) != 'service_role' AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT unlimited_bg_remove, free_bg_remove_daily, free_bg_remove_used, free_bg_remove_date
    INTO v_unlimited, v_daily_limit, v_used, v_last_date
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_unlimited THEN
    RETURN TRUE;
  END IF;

  IF v_last_date < CURRENT_DATE THEN
    v_used := 0;
  END IF;

  IF v_used < v_daily_limit THEN
    UPDATE public.profiles
      SET free_bg_remove_used = v_used + 1,
          free_bg_remove_date = CURRENT_DATE
      WHERE id = p_user_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 7. Health monitoring: add service_role RLS policies
-- ============================================================
CREATE POLICY "Service role full access system_status" ON public.system_status FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access system_health_logs" ON public.system_health_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 8. Missing indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created ON public.credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON public.referrals(referee_id);
