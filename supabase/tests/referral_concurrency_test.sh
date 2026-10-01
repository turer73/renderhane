#!/usr/bin/env bash
set -euo pipefail

# Hard stop before fixture writes: this script must never target a live project.
[[ "$(psql -v ON_ERROR_STOP=1 -qAt -c 'SELECT current_database()')" == "security_contract" ]] || {
  echo "referral concurrency tests require the disposable security_contract database" >&2
  exit 1
}
test_tmp_dir="$(mktemp -d)"
owner_pid=""
contender_pid=""
cleanup() {
  touch "$test_tmp_dir/release" 2>/dev/null || true
  for pid in "$owner_pid" "$contender_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  rm -f -- "$test_tmp_dir/ready" "$test_tmp_dir/release" "$test_tmp_dir/owner.out" "$test_tmp_dir/contender.out"
  rmdir -- "$test_tmp_dir"
}
trap cleanup EXIT
export PGOPTIONS="${PGOPTIONS:-} -c statement_timeout=10000"

psql -v ON_ERROR_STOP=1 -qAt <<'SQL'
INSERT INTO auth.users (id, email)
SELECT ('00000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid,
  'concurrency-' || i || '@example.invalid' FROM generate_series(701,709) i;
UPDATE public.profiles SET referral_code = 'AABB0701' WHERE id = '00000000-0000-0000-0000-000000000701';
UPDATE public.profiles SET referral_code = 'AABB0702' WHERE id = '00000000-0000-0000-0000-000000000702';
UPDATE public.profiles SET referral_code = 'AABB0705', referral_count = 4 WHERE id = '00000000-0000-0000-0000-000000000705';
UPDATE public.profiles SET referral_code = 'AABB0708' WHERE id = '00000000-0000-0000-0000-000000000708';
UPDATE public.profiles SET referral_code = 'AABB0709' WHERE id = '00000000-0000-0000-0000-000000000709';
SQL

race() {
  local label="$1" owner_sql="$2" contender_sql="$3" expected_contender="$4"
  local lock_count="0"
  rm -f -- "$test_tmp_dir/ready" "$test_tmp_dir/release"
  PGAPPNAME=referral-owner psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/owner.out" <<SQL &
BEGIN;
SET LOCAL ROLE service_role;
$owner_sql;
\! touch "$test_tmp_dir/ready"
\! while [ ! -f "$test_tmp_dir/release" ]; do sleep 0.05; done
COMMIT;
SQL
  owner_pid=$!
  for _ in $(seq 1 100); do
    [[ -f "$test_tmp_dir/ready" ]] && break
    kill -0 "$owner_pid" 2>/dev/null || { echo "$label: owner failed" >&2; return 1; }
    sleep 0.05
  done
  [[ -f "$test_tmp_dir/ready" ]] || { echo "$label: barrier timeout" >&2; return 1; }
  PGAPPNAME=referral-contender psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/contender.out" <<SQL &
SET ROLE service_role;
$contender_sql;
SQL
  contender_pid=$!
  for _ in $(seq 1 100); do
    lock_count="$(psql -v ON_ERROR_STOP=1 -qAt -c "SELECT count(*) FROM pg_stat_activity WHERE application_name='referral-contender' AND wait_event_type='Lock'")"
    [[ "$lock_count" == "1" ]] && break
    sleep 0.05
  done
  [[ "$lock_count" == "1" ]] || { echo "$label: contender did not wait on a lock" >&2; return 1; }
  touch "$test_tmp_dir/release"
  wait "$owner_pid"
  owner_pid=""
  wait "$contender_pid"
  contender_pid=""
  [[ "$(<"$test_tmp_dir/owner.out")" == "t" ]] || { echo "$label: owner did not succeed" >&2; return 1; }
  [[ "$(<"$test_tmp_dir/contender.out")" == "$expected_contender" ]] || { echo "$label: wrong contender result" >&2; return 1; }
  echo "PASS: $label (observed lock, checked both results)"
}

race cross-code \
  "SELECT public.complete_referral('AABB0701','00000000-0000-0000-0000-000000000703')" \
  "SELECT public.complete_referral('AABB0702','00000000-0000-0000-0000-000000000703')" f
race same-code \
  "SELECT public.complete_referral('AABB0701','00000000-0000-0000-0000-000000000704')" \
  "SELECT public.complete_referral('AABB0701','00000000-0000-0000-0000-000000000704')" f
race referrer-cap \
  "SELECT public.complete_referral('AABB0705','00000000-0000-0000-0000-000000000706')" \
  "SELECT public.complete_referral('AABB0705','00000000-0000-0000-0000-000000000707')" t
race inverse-referrals \
  "SELECT public.complete_referral('AABB0708','00000000-0000-0000-0000-000000000709')" \
  "SELECT public.complete_referral('AABB0709','00000000-0000-0000-0000-000000000708')" t

psql -v ON_ERROR_STOP=1 -qAt <<'SQL'
DO $$
DECLARE v_id UUID;
BEGIN
  FOREACH v_id IN ARRAY ARRAY['00000000-0000-0000-0000-000000000703'::UUID,'00000000-0000-0000-0000-000000000704'::UUID] LOOP
    ASSERT (SELECT credit_balance = 55 FROM public.profiles WHERE id = v_id), 'double reward under concurrency';
    ASSERT (SELECT count(*) = 1 FROM public.referrals WHERE referee_id = v_id AND status = 'completed'), 'duplicate referral';
    ASSERT (SELECT count(*) = 1 FROM public.credit_transactions WHERE user_id = v_id AND description = 'Referral welcome bonus'), 'duplicate bonus ledger';
  END LOOP;
  ASSERT (SELECT credit_balance = 70 AND referral_count = 2 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000701');
  ASSERT (SELECT credit_balance = 50 AND referral_count = 0 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000702');
  ASSERT (SELECT credit_balance = 60 AND referral_count = 5 FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000705'), 'referrer cap race';
  ASSERT (SELECT count(*) = 2 FROM public.profiles WHERE id IN ('00000000-0000-0000-0000-000000000706','00000000-0000-0000-0000-000000000707') AND credit_balance = 55);
  ASSERT (SELECT count(*) = 2 FROM public.profiles WHERE id IN ('00000000-0000-0000-0000-000000000708','00000000-0000-0000-0000-000000000709') AND credit_balance = 65 AND referral_count = 1), 'inverse referral balance mismatch';
END;
$$;
DELETE FROM auth.users WHERE id IN (
  SELECT ('00000000-0000-0000-0000-' || lpad(i::text,12,'0'))::uuid FROM generate_series(701,709) i
);
SELECT 'Referral concurrency and ledger contracts passed';
SQL
