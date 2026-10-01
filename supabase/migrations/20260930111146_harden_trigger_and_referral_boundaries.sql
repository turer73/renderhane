-- Follow-up to 20260929204937_harden_credit_authority.sql.
-- No historical balances, referrals or user records are rewritten.
BEGIN;

ALTER FUNCTION public.enforce_max_active_api_keys() SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.enforce_max_active_api_keys(), public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_max_active_api_keys(), public.handle_new_user()
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_referral(
  p_referral_code TEXT,
  p_referee_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_code TEXT := upper(btrim(p_referral_code));
  v_referrer_id UUID;
  v_referrer_count INTEGER;
  v_pending_id UUID;
  v_email TEXT;
  v_referrer_reward INTEGER := 10;
  v_referee_reward INTEGER := 5;
BEGIN
  -- Only the server may choose the beneficiary, after verifying the session.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_referee_id IS NULL OR v_code IS NULL OR v_code !~ '^[0-9A-F]{8}$' THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_referrer_id FROM public.profiles WHERE referral_code = v_code;
  IF v_referrer_id IS NULL OR v_referrer_id = p_referee_id THEN
    RETURN FALSE;
  END IF;

  -- Serialize ALL codes for one beneficiary, not just (code, beneficiary).
  PERFORM pg_advisory_xact_lock(hashtextextended('referral-referee:' || p_referee_id::text, 0));
  -- Stable lock order also prevents inverse A->B / B->A profile deadlocks.
  PERFORM id FROM public.profiles
    WHERE id IN (v_referrer_id, p_referee_id) ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_referee_id)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_referrer_id AND referral_code = v_code)
     OR EXISTS (SELECT 1 FROM public.referrals WHERE referee_id = p_referee_id AND status = 'completed') THEN
    RETURN FALSE;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_referee_id;
  -- Consume at most ONE invite, and only one addressed to this account.
  -- Other recipients' invitations must remain pending.
  SELECT id, referrer_reward, referee_reward
    INTO v_pending_id, v_referrer_reward, v_referee_reward
    FROM public.referrals
    WHERE referral_code = v_code AND referrer_id = v_referrer_id
      AND status = 'pending' AND referee_id IS NULL
      AND lower(referee_email) = lower(v_email)
    ORDER BY created_at, id LIMIT 1 FOR UPDATE;

  IF v_pending_id IS NULL THEN
    v_referrer_reward := 10;
    v_referee_reward := 5;
    INSERT INTO public.referrals (referrer_id, referee_id, referral_code, status,
      referrer_reward, referee_reward, completed_at)
    VALUES (v_referrer_id, p_referee_id, v_code, 'completed', 10, 5, now())
    ON CONFLICT (referral_code, referee_id) DO NOTHING;
    IF NOT FOUND THEN RETURN FALSE; END IF;
  ELSE
    IF v_referrer_reward < 0 OR v_referee_reward < 0 THEN RETURN FALSE; END IF;
    -- An older non-completed row may already own this unique key. Leave it
    -- untouched rather than raising or silently rewriting historical data.
    IF EXISTS (SELECT 1 FROM public.referrals WHERE referral_code = v_code AND referee_id = p_referee_id) THEN
      RETURN FALSE;
    END IF;
    UPDATE public.referrals SET referee_id = p_referee_id, status = 'completed', completed_at = now()
      WHERE id = v_pending_id;
  END IF;

  SELECT referral_count INTO v_referrer_count FROM public.profiles WHERE id = v_referrer_id;
  IF v_referrer_count < 5 THEN
    UPDATE public.profiles SET credit_balance = credit_balance + v_referrer_reward,
      referral_count = referral_count + 1, unlimited_bg_remove = TRUE, updated_at = now()
      WHERE id = v_referrer_id;
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
      VALUES (v_referrer_id, v_referrer_reward, 'bonus', 'Referral bonus — friend joined');
  END IF;

  UPDATE public.profiles SET credit_balance = credit_balance + v_referee_reward,
    unlimited_bg_remove = TRUE, updated_at = now() WHERE id = p_referee_id;
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (p_referee_id, v_referee_reward, 'bonus', 'Referral welcome bonus');
  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_referral(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_referral(TEXT, UUID) TO service_role;
COMMIT;
