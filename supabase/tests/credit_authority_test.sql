\set ON_ERROR_STOP on
BEGIN;

INSERT INTO public.jobs (user_id, tool, model_id, credit_cost) VALUES
  ('00000000-0000-0000-0000-000000000101', 'bg-remove', 'owner-one-fixture', 0),
  ('00000000-0000-0000-0000-000000000102', 'bg-remove', 'owner-two-fixture', 0);

-- SECURITY INVOKER: statements below execute with the tested client role.
CREATE FUNCTION pg_temp.expect_denied(p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  RAISE EXCEPTION 'Expected permission denial: %', p_sql;
END;
$$;

-- Check effective privileges, including inherited PUBLIC and column grants.
DO $$
DECLARE
  v_role TEXT;
  v_signature TEXT;
  v_table TEXT;
  v_column TEXT;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_signature IN ARRAY ARRAY[
      'public.reserve_credits(uuid,integer,text)', 'public.refund_credits(uuid)',
      'public.add_credits(uuid,integer,text,text)', 'public.confirm_spend(uuid,uuid)',
      'public.complete_referral(text,uuid)', 'public.check_free_bg_remove(uuid)',
      'public.renew_subscription(uuid,text)'
    ] LOOP
      ASSERT NOT has_function_privilege(v_role, v_signature, 'EXECUTE'), v_role || ' still has ' || v_signature;
      ASSERT has_function_privilege('service_role', v_signature, 'EXECUTE'), 'service lost ' || v_signature;
    END LOOP;
    FOREACH v_table IN ARRAY ARRAY['profiles', 'jobs', 'credit_transactions', 'referrals', 'subscriptions'] LOOP
      ASSERT NOT has_table_privilege(v_role, 'public.' || v_table, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
        v_role || ' has table write grant: ' || v_table;
      ASSERT NOT has_any_column_privilege(v_role, 'public.' || v_table, 'INSERT,REFERENCES'),
        v_role || ' has column insertion/references grant: ' || v_table;
      IF v_table <> 'profiles' THEN
        ASSERT NOT has_any_column_privilege(v_role, 'public.' || v_table, 'UPDATE'),
          v_role || ' has column update grant: ' || v_table;
      END IF;
    END LOOP;
    FOREACH v_column IN ARRAY ARRAY['id', 'credit_balance', 'referral_code', 'referral_count', 'unlimited_bg_remove', 'free_bg_remove_daily', 'free_bg_remove_used', 'free_bg_remove_date', 'created_at', 'updated_at'] LOOP
      ASSERT NOT has_column_privilege(v_role, 'public.profiles', v_column, 'UPDATE'), 'protected profile column writable: ' || v_column;
    END LOOP;
  END LOOP;
END;
$$;

-- NULL-session anonymous callers cannot reach any money/free-allowance RPC.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT pg_temp.expect_denied($q$SELECT public.reserve_credits('00000000-0000-0000-0000-000000000101', -7, 'attack')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.refund_credits('00000000-0000-0000-0000-000000000301')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.add_credits('00000000-0000-0000-0000-000000000101', 1000, 'forged', 'attack')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.confirm_spend('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000401')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.complete_referral('AABBCC01', '00000000-0000-0000-0000-000000000102')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.check_free_bg_remove('00000000-0000-0000-0000-000000000101')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.renew_subscription('00000000-0000-0000-0000-000000000201', 'forged')$q$);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
SELECT pg_temp.expect_denied($q$UPDATE public.profiles SET credit_balance = 999 WHERE id = '00000000-0000-0000-0000-000000000101'$q$);
SELECT pg_temp.expect_denied($q$UPDATE public.profiles SET unlimited_bg_remove = true WHERE id = '00000000-0000-0000-0000-000000000101'$q$);
SELECT pg_temp.expect_denied($q$UPDATE public.profiles SET free_bg_remove_used = 0 WHERE id = '00000000-0000-0000-0000-000000000101'$q$);
SELECT pg_temp.expect_denied($q$INSERT INTO public.profiles (id, credit_balance) VALUES ('00000000-0000-0000-0000-000000000103', 999)$q$);
SELECT pg_temp.expect_denied($q$INSERT INTO public.jobs (user_id, tool, model_id, credit_cost) VALUES ('00000000-0000-0000-0000-000000000101', 'bg-remove', 'forged-provider', 0)$q$);
SELECT pg_temp.expect_denied($q$UPDATE public.jobs SET credit_cost = 0$q$);
SELECT pg_temp.expect_denied($q$DELETE FROM public.jobs$q$);
SELECT pg_temp.expect_denied($q$TRUNCATE public.referrals$q$);
SELECT pg_temp.expect_denied($q$SELECT public.reserve_credits('00000000-0000-0000-0000-000000000101', 1, 'self also forbidden')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.reserve_credits('00000000-0000-0000-0000-000000000102', 1, 'other user')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.check_free_bg_remove('00000000-0000-0000-0000-000000000101')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.complete_referral('AABBCC02', '00000000-0000-0000-0000-000000000101')$q$);
SELECT pg_temp.expect_denied($q$SELECT public.renew_subscription('00000000-0000-0000-0000-000000000201', 'forged')$q$);

-- Normal profile editing still works, and RLS still hides other users.
UPDATE public.profiles SET display_name = 'Safe name', avatar_url = 'https://example.invalid/avatar.png', locale = 'en', use_case = '3dprint'
  WHERE id = '00000000-0000-0000-0000-000000000101';
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  ASSERT (SELECT count(*) = 1 FROM public.profiles), 'profile reads leaked another user';
  ASSERT (SELECT count(*) = 1 FROM public.jobs), 'job reads leaked another user';
  ASSERT (SELECT display_name = 'Safe name' AND locale = 'en' AND use_case = '3dprint' FROM public.profiles), 'safe editing failed';
  UPDATE public.profiles SET display_name = 'attacker' WHERE id = '00000000-0000-0000-0000-000000000102';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'could edit another user';
END;
$$;
RESET ROLE;

-- Signup still provisions a profile and bonus through the trusted trigger.
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000103', 'security-new@example.invalid');
DO $$
BEGIN
  ASSERT (SELECT credit_balance = 50 AND referral_code IS NOT NULL FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000103'), 'signup profile failed';
  ASSERT (SELECT count(*) = 1 FROM public.credit_transactions WHERE user_id = '00000000-0000-0000-0000-000000000103' AND amount = 50), 'signup bonus failed';
END;
$$;

-- Positive, atomic reservations and trusted refund/spend/payment contracts.
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_amount INTEGER;
  v_tx UUID;
  v_job UUID;
  v_before INTEGER;
  v_bundle UUID[];
BEGIN
  FOREACH v_amount IN ARRAY ARRAY[NULL::INTEGER, 0, -1, -2147483648] LOOP
    BEGIN
      PERFORM public.reserve_credits('00000000-0000-0000-0000-000000000101', v_amount, 'invalid');
      RAISE EXCEPTION 'invalid amount accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.reserve_credits(NULL, 1, 'invalid');
    RAISE EXCEPTION 'null user accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.reserve_credits('00000000-0000-0000-0000-000000000101', 101, 'insufficient');
    RAISE EXCEPTION 'overspend accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'insufficient_credits' THEN RAISE; END IF;
  END;
  ASSERT (SELECT credit_balance = 100 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101'), 'invalid requests changed balance';

  v_tx := public.reserve_credits('00000000-0000-0000-0000-000000000101', 25, 'trusted job');
  ASSERT (SELECT amount = -25 AND status = 'reserved' FROM public.credit_transactions WHERE id = v_tx), 'invalid reservation ledger';
  INSERT INTO public.jobs (user_id, tool, model_id, credit_cost, credit_tx_id)
    VALUES ('00000000-0000-0000-0000-000000000101', 'bg-remove', 'trusted-provider', 25, v_tx)
    RETURNING id INTO v_job;
  ASSERT public.confirm_spend(v_tx, v_job), 'spend failed';
  ASSERT NOT public.confirm_spend(v_tx, v_job), 'spend was not idempotent';
  PERFORM public.refund_credits(v_tx);
  ASSERT (SELECT credit_balance = 75 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101'), 'completed spend refunded';

  v_tx := public.reserve_credits('00000000-0000-0000-0000-000000000101', 5, 'trusted failure');
  PERFORM public.refund_credits(v_tx);
  PERFORM public.refund_credits(v_tx);
  ASSERT (SELECT credit_balance = 75 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101'), 'refund not exactly once';
  ASSERT (SELECT status = 'refunded' FROM public.credit_transactions WHERE id = v_tx), 'refund ledger missing';

  PERFORM public.add_credits('00000000-0000-0000-0000-000000000101', 10, 'verified-test-payment', 'verified callback');
  BEGIN
    PERFORM public.add_credits('00000000-0000-0000-0000-000000000101', 10, 'verified-test-payment', 'retry');
    RAISE EXCEPTION 'duplicate payment accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  ASSERT (SELECT credit_balance = 85 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101'), 'payment replay changed balance';

  ASSERT public.check_free_bg_remove('00000000-0000-0000-0000-000000000101'), 'first free request failed';
  ASSERT public.check_free_bg_remove('00000000-0000-0000-0000-000000000101'), 'second free request failed';
  ASSERT public.check_free_bg_remove('00000000-0000-0000-0000-000000000101'), 'third free request failed';
  ASSERT NOT public.check_free_bg_remove('00000000-0000-0000-0000-000000000101'), 'free limit ignored';

  -- Privilege change must not break the authenticated server referral route.
  ASSERT public.complete_referral('AABBCC01', '00000000-0000-0000-0000-000000000102'), 'trusted referral failed';
  ASSERT (SELECT credit_balance = 105 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000102'), 'referee reward changed';

  SELECT credit_balance INTO v_before FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101';
  PERFORM public.renew_subscription('00000000-0000-0000-0000-000000000201', 'verified-test-renewal');
  BEGIN
    PERFORM public.renew_subscription('00000000-0000-0000-0000-000000000201', 'verified-test-renewal');
    RAISE EXCEPTION 'duplicate renewal accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  ASSERT (SELECT credit_balance = v_before + 50 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101'), 'trusted renewal/retry changed amount';

  -- Existing atomic Social Kit reservations still work with the narrower ACLs.
  SELECT credit_balance INTO v_before FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101';
  v_bundle := public.reserve_credit_bundle('00000000-0000-0000-0000-000000000101', ARRAY[8, 8, 8, 8, 35], ARRAY['scene 1', 'scene 2', 'scene 3', 'scene 4', 'video']);
  ASSERT cardinality(v_bundle) = 5, 'bundle reservation failed';
  ASSERT (SELECT credit_balance = v_before - 67 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101'), 'bundle charge changed';
  FOREACH v_tx IN ARRAY v_bundle LOOP
    PERFORM public.refund_credits(v_tx);
  END LOOP;
  ASSERT (SELECT credit_balance = v_before FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000101'), 'bundle refund failed';
END;
$$;
RESET ROLE;
ROLLBACK;
SELECT 'Credit authority, RLS, signup, free allowance and trusted financial contracts passed' AS result;
