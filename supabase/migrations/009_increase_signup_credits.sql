-- Increase signup credits from 20 to 50
-- Run in Supabase SQL Editor

-- 1. Update the profile default
ALTER TABLE profiles ALTER COLUMN credit_balance SET DEFAULT 50;

-- 2. Replace the trigger function to grant 50 credits on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, credit_balance)
  VALUES (NEW.id, NEW.email, 50)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 50, 'bonus', 'Welcome bonus - 50 free credits');

  RETURN NEW;
END;
$$;

-- Note: Existing users keep their current balance. Only new signups get 50.
