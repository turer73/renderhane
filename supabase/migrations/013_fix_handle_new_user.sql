-- 013_fix_handle_new_user.sql
-- Fix: Migration 009 broke handle_new_user() by inserting into non-existent
-- 'email' column and removing display_name, avatar_url, referral_code.
-- Also fixes search_path (was set to '' which blocks access to public schema).
--
-- Run in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_ref_code TEXT;
  v_attempts INTEGER := 0;
BEGIN
  -- Generate unique referral code
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
    50,
    v_ref_code
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 50, 'bonus', 'Welcome bonus - 50 free credits');

  RETURN NEW;
END;
$$;
