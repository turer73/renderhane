\set ON_ERROR_STOP on
-- DISPOSABLE DATABASE ONLY. All fixtures and temporary grants roll back.
BEGIN;
CREATE FUNCTION pg_temp.expect_boundary_denied(p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN insufficient_privilege THEN RETURN;
  END;
  RAISE EXCEPTION 'Expected permission denial: %', p_sql;
END;
$$;
DO $$
DECLARE v_role TEXT; v_signature TEXT;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_signature IN ARRAY ARRAY['public.handle_new_user()', 'public.enforce_max_active_api_keys()', 'public.complete_referral(text,uuid)'] LOOP
      ASSERT NOT has_function_privilege(v_role, v_signature, 'EXECUTE'), 'client function access remains';
      ASSERT has_function_privilege('service_role', v_signature, 'EXECUTE'), 'server function access lost';
    END LOOP;
  END LOOP;
  ASSERT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.enforce_max_active_api_keys()'::regprocedure), 'trigger search path is mutable';
  ASSERT (SELECT proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'public.complete_referral(text,uuid)'::regprocedure), 'referral search path is unsafe';
END;
$$;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_boundary_denied('SELECT public.handle_new_user()');
SELECT pg_temp.expect_boundary_denied('SELECT public.enforce_max_active_api_keys()');
SELECT pg_temp.expect_boundary_denied($q$SELECT public.complete_referral('AABBCC01','00000000-0000-0000-0000-000000000102')$q$);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_boundary_denied('SELECT public.handle_new_user()');
SELECT pg_temp.expect_boundary_denied('SELECT public.enforce_max_active_api_keys()');
SELECT pg_temp.expect_boundary_denied($q$SELECT public.complete_referral('AABBCC01','00000000-0000-0000-0000-000000000102')$q$);
RESET ROLE;
-- Defense in depth: even a function owner not acting as service_role is denied.
SELECT pg_temp.expect_boundary_denied($q$SELECT public.complete_referral('AABBCC01','00000000-0000-0000-0000-000000000102')$q$);

-- A role without direct EXECUTE still fires the installed signup trigger.
-- This fixture-only table grant is NOT part of any production migration.
GRANT INSERT ON auth.users TO authenticated;
SET LOCAL ROLE authenticated;
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000501', 'referrer-a@example.invalid');
RESET ROLE;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000502', 'referrer-b@example.invalid'),
  ('00000000-0000-0000-0000-000000000503', 'direct@example.invalid'),
  ('00000000-0000-0000-0000-000000000504', 'invited@example.invalid'),
  ('00000000-0000-0000-0000-000000000505', 'other@example.invalid');
UPDATE public.profiles SET referral_code = 'AABB0501' WHERE id = '00000000-0000-0000-0000-000000000501';
UPDATE public.profiles SET referral_code = 'AABB0502', referral_count = 5 WHERE id = '00000000-0000-0000-0000-000000000502';
DO $$
BEGIN
  ASSERT (SELECT credit_balance = 50 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000501'), 'signup trigger failed';
  ASSERT (SELECT count(*) = 1 FROM public.credit_transactions WHERE user_id = '00000000-0000-0000-0000-000000000501' AND amount = 50), 'signup bonus failed';
END;
$$;

-- The installed API-key trigger still permits five and rejects the sixth
-- for an ordinary client even though direct EXECUTE has been revoked.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
INSERT INTO public.api_keys (user_id, key_hash, key_prefix)
  SELECT '00000000-0000-0000-0000-000000000501', 'boundary-hash-' || i, 'test' FROM generate_series(1,5) i;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.api_keys (user_id, key_hash, key_prefix) VALUES ('00000000-0000-0000-0000-000000000501', 'boundary-sixth', 'test');
    RAISE EXCEPTION 'sixth active key accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT count(*) = 5 FROM public.api_keys), 'API key boundary changed';
END;
$$;
RESET ROLE;

INSERT INTO public.referrals (referrer_id, referral_code, referee_email) VALUES
  ('00000000-0000-0000-0000-000000000501', 'AABB0501', 'INVITED@example.invalid'),
  ('00000000-0000-0000-0000-000000000501', 'AABB0501', 'invited@example.invalid'),
  ('00000000-0000-0000-0000-000000000501', 'AABB0501', 'other@example.invalid');
SET LOCAL ROLE service_role;
DO $$
BEGIN
  ASSERT NOT public.complete_referral(NULL, '00000000-0000-0000-0000-000000000503');
  ASSERT NOT public.complete_referral('AABB0501', NULL);
  ASSERT NOT public.complete_referral('bad code', '00000000-0000-0000-0000-000000000503');
  ASSERT NOT public.complete_referral('FFFFFFFF', '00000000-0000-0000-0000-000000000503');
  ASSERT NOT public.complete_referral('AABB0501', '00000000-0000-0000-0000-000000000501'), 'self referral accepted';
  ASSERT NOT public.complete_referral('AABB0501', '00000000-0000-0000-0000-000000000599'), 'missing user accepted';

  ASSERT public.complete_referral(' aabb0501 ', '00000000-0000-0000-0000-000000000503'), 'direct referral failed';
  ASSERT NOT public.complete_referral('AABB0501', '00000000-0000-0000-0000-000000000503'), 'same-code retry rewarded';
  ASSERT NOT public.complete_referral('AABB0502', '00000000-0000-0000-0000-000000000503'), 'cross-code retry rewarded';
  ASSERT (SELECT count(*) = 3 FROM public.referrals WHERE status = 'pending'), 'direct link consumed another recipient invite';
  ASSERT (SELECT credit_balance = 55 AND unlimited_bg_remove FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000503'), 'beneficiary reward is not exactly once';
  ASSERT (SELECT count(*) = 1 FROM public.credit_transactions WHERE user_id = '00000000-0000-0000-0000-000000000503' AND description = 'Referral welcome bonus'), 'duplicate beneficiary ledger';

  ASSERT public.complete_referral('AABB0501', '00000000-0000-0000-0000-000000000504'), 'email invite failed';
  ASSERT (SELECT count(*) = 1 FROM public.referrals WHERE lower(referee_email) = 'invited@example.invalid' AND status = 'completed'), 'did not complete exactly one matching invite';
  ASSERT (SELECT count(*) = 1 FROM public.referrals WHERE lower(referee_email) = 'invited@example.invalid' AND status = 'pending'), 'duplicate pending invite was consumed';
  ASSERT (SELECT status = 'pending' AND referee_id IS NULL FROM public.referrals WHERE referee_email = 'other@example.invalid'), 'unrelated invite changed';
  ASSERT (SELECT credit_balance = 70 AND referral_count = 2 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000501'), 'referrer reward/count changed';

  ASSERT public.complete_referral('AABB0502', '00000000-0000-0000-0000-000000000505'), 'capped referrer blocked valid beneficiary';
  ASSERT (SELECT credit_balance = 50 AND referral_count = 5 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000502'), 'five-referral cap bypassed';
  ASSERT (SELECT credit_balance = 55 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000505'), 'capped referrer changed beneficiary bonus';
  ASSERT (SELECT count(*) = 0 FROM public.credit_transactions WHERE user_id = '00000000-0000-0000-0000-000000000502' AND description = 'Referral bonus — friend joined'), 'capped referrer got ledger credit';
END;
$$;
RESET ROLE;
ROLLBACK;
SELECT 'Trigger ACL/search paths, signup, API-key limit and single-beneficiary referral contracts passed' AS result;
