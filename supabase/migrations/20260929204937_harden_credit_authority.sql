-- Financial state belongs to authenticated server flows, not browser/PostgREST
-- clients. This migration changes authority, not any existing balance or job.
BEGIN;

-- Table privileges override column privileges. Remove both inherited PUBLIC
-- grants and any old explicit column grants before allowing profile cosmetics.
DO $$
DECLARE
  v_table TEXT;
  v_columns TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['profiles', 'jobs', 'credit_transactions', 'referrals', 'subscriptions'] LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      v_table
    );
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
      INTO v_columns
      FROM pg_attribute
      WHERE attrelid = format('public.%I', v_table)::regclass
        AND attnum > 0 AND NOT attisdropped;
    EXECUTE format(
      'REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
      v_columns, v_columns, v_columns, v_table
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', v_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
  END LOOP;
END;
$$;

GRANT UPDATE (display_name, avatar_url, locale, use_case) ON public.profiles TO authenticated;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- The null auth.uid() case must not authorize a request. Reservations are only
-- made by the server AFTER it selects/prices an allowed model and verifies auth.
CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id UUID, p_amount INTEGER, p_description TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_tx_id UUID;
  v_balance INTEGER;
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_credit_reservation' USING ERRCODE = '22023';
  END IF;

  SELECT credit_balance INTO v_balance FROM public.profiles
    WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  UPDATE public.profiles SET credit_balance = credit_balance - p_amount, updated_at = now()
    WHERE id = p_user_id;
  INSERT INTO public.credit_transactions (user_id, amount, type, status, description)
    VALUES (p_user_id, -p_amount, 'spend', 'reserved', p_description)
    RETURNING id INTO v_tx_id;
  RETURN v_tx_id;
END;
$$;

-- Revoke function EXECUTE as well as protecting table writes: SECURITY DEFINER
-- functions bypass caller RLS. Preserve signatures and service-role callers,
-- including the payment webhook, referral callback and free background removal.
REVOKE ALL ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credits(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_credits(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_spend(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_referral(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_free_bg_remove(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_subscription(UUID, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_credits(UUID, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_spend(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_referral(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_free_bg_remove(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_subscription(UUID, TEXT) TO service_role;

COMMIT;
