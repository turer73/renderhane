\set ON_ERROR_STOP on

BEGIN;

TRUNCATE public.credit_transactions, public.profiles CASCADE;

INSERT INTO public.profiles (id, credit_balance)
VALUES
  ('00000000-0000-0000-0000-000000000067', 100),
  ('00000000-0000-0000-0000-000000000050', 50);

SET ROLE service_role;

DO $$
DECLARE
  v_tx_ids UUID[];
  v_balance INTEGER;
  v_count INTEGER;
  v_sum INTEGER;
BEGIN
  SELECT public.reserve_credit_bundle(
    '00000000-0000-0000-0000-000000000067',
    ARRAY[8, 8, 8, 8, 35],
    ARRAY[
      'social-kit scene 1',
      'social-kit scene 2',
      'social-kit scene 3',
      'social-kit scene 4',
      'social-kit product video'
    ]
  ) INTO v_tx_ids;

  SELECT credit_balance INTO v_balance
  FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000067';

  SELECT COUNT(*), SUM(amount) INTO v_count, v_sum
  FROM public.credit_transactions
  WHERE user_id = '00000000-0000-0000-0000-000000000067'
    AND status = 'reserved';

  IF cardinality(v_tx_ids) IS DISTINCT FROM 5
     OR v_balance IS DISTINCT FROM 33
     OR v_count IS DISTINCT FROM 5
     OR v_sum IS DISTINCT FROM -67 THEN
    RAISE EXCEPTION
      'successful bundle assertion failed: ids=%, balance=%, count=%, sum=%',
      cardinality(v_tx_ids), v_balance, v_count, v_sum;
  END IF;
END;
$$;

DO $$
DECLARE
  v_balance INTEGER;
  v_count INTEGER;
BEGIN
  BEGIN
    PERFORM public.reserve_credit_bundle(
      '00000000-0000-0000-0000-000000000050',
      ARRAY[8, 8, 8, 8, 35],
      ARRAY['scene 1', 'scene 2', 'scene 3', 'scene 4', 'video']
    );
    RAISE EXCEPTION 'reserve_credit_bundle unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%insufficient_credits%' THEN
        RAISE;
      END IF;
  END;

  SELECT credit_balance INTO v_balance
  FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000050';

  SELECT COUNT(*) INTO v_count
  FROM public.credit_transactions
  WHERE user_id = '00000000-0000-0000-0000-000000000050';

  IF v_balance IS DISTINCT FROM 50 OR v_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION
      'insufficient bundle was not atomic: balance=%, count=%',
      v_balance, v_count;
  END IF;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.reserve_credit_bundle(
      '00000000-0000-0000-0000-000000000067',
      ARRAY[8, 35],
      ARRAY['only one description']
    );
    RAISE EXCEPTION 'reserve_credit_bundle unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%invalid_bundle%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

DO $$
DECLARE
  v_case INTEGER;
  v_rejected BOOLEAN;
  v_balance INTEGER;
  v_count INTEGER;
BEGIN
  FOR v_case IN 1..4 LOOP
    v_rejected := FALSE;
    BEGIN
      CASE v_case
        WHEN 1 THEN
          PERFORM public.reserve_credit_bundle(
            '00000000-0000-0000-0000-000000000067',
            NULL::INTEGER[],
            ARRAY['null amounts']
          );
        WHEN 2 THEN
          PERFORM public.reserve_credit_bundle(
            '00000000-0000-0000-0000-000000000067',
            ARRAY[1],
            NULL::TEXT[]
          );
        WHEN 3 THEN
          PERFORM public.reserve_credit_bundle(
            '00000000-0000-0000-0000-000000000067',
            ARRAY[1, NULL]::INTEGER[],
            ARRAY['valid', 'null amount']
          );
        WHEN 4 THEN
          PERFORM public.reserve_credit_bundle(
            '00000000-0000-0000-0000-000000000067',
            ARRAY[1, 1],
            ARRAY['valid', NULL]::TEXT[]
          );
      END CASE;
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLERRM IS DISTINCT FROM 'invalid_bundle' THEN
          RAISE;
        END IF;
        v_rejected := TRUE;
    END;

    IF NOT v_rejected THEN
      RAISE EXCEPTION 'nullable bundle case % unexpectedly succeeded', v_case;
    END IF;
  END LOOP;

  SELECT credit_balance INTO STRICT v_balance
  FROM public.profiles
  WHERE id = '00000000-0000-0000-0000-000000000067';

  SELECT COUNT(*) INTO v_count
  FROM public.credit_transactions
  WHERE user_id = '00000000-0000-0000-0000-000000000067';

  IF v_balance IS DISTINCT FROM 33 OR v_count IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION
      'nullable bundle validation mutated ledger: balance=%, count=%',
      v_balance, v_count;
  END IF;
END;
$$;

RESET ROLE;
SET ROLE authenticated;

DO $$
BEGIN
  BEGIN
    PERFORM public.reserve_credit_bundle(
      '00000000-0000-0000-0000-000000000067',
      ARRAY[1],
      ARRAY['unauthorized attempt']
    );
    RAISE EXCEPTION 'expected authorization failure';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%unauthorized%' THEN
        RAISE;
      END IF;
  END;
END;
$$;

RESET ROLE;
ROLLBACK;
