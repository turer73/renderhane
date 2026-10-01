\set ON_ERROR_STOP on
-- DISPOSABLE DATABASE ONLY: reproduce the defects before the follow-up patch.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000501', 'legacy-referrer@example.invalid'),
  ('00000000-0000-0000-0000-000000000502', 'legacy-recipient@example.invalid');
UPDATE public.profiles SET referral_code = 'AABB0501' WHERE id = '00000000-0000-0000-0000-000000000501';
INSERT INTO public.referrals (referrer_id, referral_code, referee_email)
  VALUES ('00000000-0000-0000-0000-000000000501', 'AABB0501', 'someone-else@example.invalid');
SET LOCAL ROLE service_role;
DO $$
BEGIN
  ASSERT public.complete_referral('AABBCC01', '00000000-0000-0000-0000-000000000502');
  ASSERT public.complete_referral('AABB0501', '00000000-0000-0000-0000-000000000502'), 'legacy repeat not reproduced';
  ASSERT (SELECT credit_balance = 60 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000502'), 'legacy repeat bonus not reproduced';
  ASSERT EXISTS (SELECT 1 FROM public.referrals WHERE referee_email = 'someone-else@example.invalid'
    AND referee_id = '00000000-0000-0000-0000-000000000502' AND status = 'completed'), 'legacy unrelated invite consumption not reproduced';
END;
$$;
RESET ROLE;
ROLLBACK;
SELECT 'Reproduced cross-code double rewards and unrelated invite consumption' AS result;
