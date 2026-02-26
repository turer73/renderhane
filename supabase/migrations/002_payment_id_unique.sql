-- Migration: Add UNIQUE constraint on payment_id to prevent double-crediting
-- This addresses the race condition where both callback and webhook can
-- simultaneously pass the application-level idempotency check and insert
-- duplicate credit transactions for the same payment.

-- Partial unique index: only enforced for non-NULL payment_id values,
-- since spend/refund/bonus transactions don't carry a payment_id.
CREATE UNIQUE INDEX idx_credit_transactions_payment_id_unique
  ON public.credit_transactions (payment_id)
  WHERE payment_id IS NOT NULL;

-- Update add_credits to be truly idempotent at the database level.
-- Uses INSERT ... ON CONFLICT DO NOTHING so that if a duplicate payment_id
-- is inserted concurrently, the second caller gets NULL back instead of
-- an error, and no duplicate credits are awarded.
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
  -- Lock the profile row to prevent concurrent balance modifications
  SELECT credit_balance INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Insert transaction with conflict guard on payment_id
  INSERT INTO public.credit_transactions
    (user_id, amount, type, status, description, payment_id)
  VALUES
    (p_user_id, p_amount, 'purchase', 'completed', p_description, p_payment_id)
  ON CONFLICT (payment_id) WHERE payment_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_tx_id;

  -- If conflict occurred (duplicate payment), v_tx_id is NULL — skip balance update
  IF v_tx_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Add balance atomically
  UPDATE public.profiles
    SET credit_balance = credit_balance + p_amount,
        updated_at = now()
    WHERE id = p_user_id;

  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
