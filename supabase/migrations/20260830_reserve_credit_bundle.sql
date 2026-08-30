-- Atomically reserve the child-job costs of an orchestration bundle.
-- The service role is the only caller; public clients cannot manufacture
-- arbitrary reservation arrays.

CREATE OR REPLACE FUNCTION public.reserve_credit_bundle(
  p_user_id UUID,
  p_amounts INTEGER[],
  p_descriptions TEXT[]
) RETURNS UUID[] AS $$
DECLARE
  v_balance INTEGER;
  v_total INTEGER;
  v_index INTEGER;
  v_tx_id UUID;
  v_tx_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF COALESCE(cardinality(p_amounts), 0) = 0
     OR cardinality(p_amounts) > 20
     OR cardinality(p_amounts) != cardinality(p_descriptions) THEN
    RAISE EXCEPTION 'invalid_bundle';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_amounts) AS amount
    WHERE amount IS NULL OR amount <= 0
  ) OR EXISTS (
    SELECT 1
    FROM unnest(p_descriptions) AS description
    WHERE description IS NULL OR btrim(description) = ''
  ) THEN
    RAISE EXCEPTION 'invalid_bundle';
  END IF;

  SELECT SUM(amount) INTO v_total FROM unnest(p_amounts) AS amount;

  SELECT credit_balance INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  IF v_balance < v_total THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  UPDATE public.profiles
    SET credit_balance = credit_balance - v_total,
        updated_at = now()
    WHERE id = p_user_id;

  FOR v_index IN 1..cardinality(p_amounts) LOOP
    INSERT INTO public.credit_transactions
      (user_id, amount, type, status, description)
    VALUES
      (
        p_user_id,
        -p_amounts[v_index],
        'spend',
        'reserved',
        p_descriptions[v_index]
      )
    RETURNING id INTO v_tx_id;

    v_tx_ids := array_append(v_tx_ids, v_tx_id);
  END LOOP;

  RETURN v_tx_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.reserve_credit_bundle(UUID, INTEGER[], TEXT[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credit_bundle(UUID, INTEGER[], TEXT[])
  TO service_role;
