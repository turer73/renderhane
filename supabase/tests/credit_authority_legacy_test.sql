\set ON_ERROR_STOP on
-- Confirms that the isolated fixture actually reproduces the original bugs.
-- All demonstrations are rolled back; these are not production probe commands.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
UPDATE public.profiles SET credit_balance = 999, unlimited_bg_remove = true
  WHERE id = '00000000-0000-0000-0000-000000000101';
DO $$
BEGIN
  ASSERT (SELECT credit_balance = 999 AND unlimited_bg_remove FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000101'), 'fixture must reproduce direct credit mutation';
END;
$$;
INSERT INTO public.jobs (user_id, tool, model_id, credit_cost)
  VALUES ('00000000-0000-0000-0000-000000000101', 'bg-remove', 'forged-provider', 0);
ROLLBACK;

BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT public.reserve_credits('00000000-0000-0000-0000-000000000101', -7, 'isolated NULL-auth regression');
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT credit_balance = 107 FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000101'), 'fixture must reproduce negative anonymous reservation';
END;
$$;
SET LOCAL ROLE anon;
SELECT public.renew_subscription('00000000-0000-0000-0000-000000000201', 'isolated-forged-payment');
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT credit_balance = 157 FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000101'), 'fixture must reproduce unverified anonymous renewal';
END;
$$;
ROLLBACK;
SELECT 'Legacy credit authority regressions reproduced (rolled back)' AS result;
