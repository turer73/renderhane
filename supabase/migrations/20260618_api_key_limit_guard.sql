-- #622: Enforce max 5 active API keys per user atomically.
-- Run in Supabase SQL Editor (renderhane convention). Idempotent (re-runnable).
--
-- Closes a check-then-insert TOCTOU race in POST /api/v1/keys: two concurrent
-- requests could each pass the app-level "activeKeys >= 5" pre-check and then
-- both INSERT, leaving the user with 6+ active keys. A BEFORE INSERT trigger
-- with a per-user transaction-scoped advisory lock makes the count atomic, so
-- the 6th concurrent insert is rejected even under a race.

CREATE OR REPLACE FUNCTION public.enforce_max_active_api_keys()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Serialize concurrent inserts for the same user. Transaction-scoped lock,
  -- auto-released on COMMIT/ROLLBACK; keyed by user_id so different users do
  -- not contend with each other.
  PERFORM pg_advisory_xact_lock(hashtext('api_keys_limit:' || NEW.user_id::text));

  IF (
    SELECT count(*) FROM public.api_keys
    WHERE user_id = NEW.user_id AND is_active = true
  ) >= 5 THEN
    RAISE EXCEPTION 'API key limit reached (max 5 active keys per user)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_active_api_keys ON public.api_keys;
CREATE TRIGGER trg_enforce_max_active_api_keys
  BEFORE INSERT ON public.api_keys
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.enforce_max_active_api_keys();
