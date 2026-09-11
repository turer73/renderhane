#!/usr/bin/env bash
set -euo pipefail

test_user="00000000-0000-0000-0000-000000000303"
request_hash="dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
test_tmp_dir="$(mktemp -d)"
claim_owner_pid=""
claim_contender_pid=""
reserve_owner_pid=""
reserve_contender_pid=""
transition_owner_pid=""
transition_contender_pid=""

cleanup() {
  touch \
    "$test_tmp_dir/claim.release" \
    "$test_tmp_dir/claim-completion.release" \
    "$test_tmp_dir/reserve.release" \
    "$test_tmp_dir/success.release" \
    "$test_tmp_dir/failure.release" \
    "$test_tmp_dir/cancel.release" \
    "$test_tmp_dir/success-cancel.release" \
    2>/dev/null || true
  for pid in "$claim_owner_pid" "$claim_contender_pid" "$reserve_owner_pid" "$reserve_contender_pid" "$transition_owner_pid" "$transition_contender_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  rm -rf -- "$test_tmp_dir"
}

wait_for_lock() {
  local application_name="$1"
  local lock_count

  for _ in $(seq 1 100); do
    lock_count="$(psql -v ON_ERROR_STOP=1 -qAt -c \
      "SELECT COUNT(*) FROM pg_catalog.pg_stat_activity WHERE application_name = '$application_name' AND wait_event_type = 'Lock';")"
    [[ "$lock_count" == "1" ]] && return 0
    sleep 0.05
  done

  return 1
}

trap cleanup EXIT
export PGOPTIONS="${PGOPTIONS:-} -c statement_timeout=10000"

psql -v ON_ERROR_STOP=1 -qAt <<SQL
INSERT INTO public.profiles (id, credit_balance)
VALUES ('$test_user', 100)
ON CONFLICT (id) DO UPDATE SET credit_balance = EXCLUDED.credit_balance;
DELETE FROM public.social_kit_requests WHERE user_id = '$test_user';
SQL

# Keep the winning insert uncommitted until pg_stat_activity proves the
# contender is waiting on its unique-index transaction lock. This makes the
# concurrency contract deterministic instead of relying on a fixed sleep.
PGAPPNAME=social-kit-claim-owner \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/owner.out" <<SQL &
BEGIN;
SET LOCAL ROLE service_role;
SELECT disposition
FROM public.claim_social_kit_request(
  '$test_user',
  'concurrent-owner-key',
  '$request_hash'
);
\! touch "$test_tmp_dir/owner.ready"
\! while [ ! -f "$test_tmp_dir/claim.release" ]; do sleep 0.05; done
COMMIT;
SQL
claim_owner_pid=$!

for _ in $(seq 1 100); do
  [[ -f "$test_tmp_dir/owner.ready" ]] && break
  sleep 0.05
done
if [[ ! -f "$test_tmp_dir/owner.ready" ]]; then
  echo "owner claim did not reach the concurrency barrier" >&2
  exit 1
fi

PGAPPNAME=social-kit-claim-contender \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/contender.out" <<SQL &
SET ROLE service_role;
SELECT disposition
FROM public.claim_social_kit_request(
  '$test_user',
  'concurrent-contender-key',
  '$request_hash'
);
SQL
claim_contender_pid=$!

if ! wait_for_lock "social-kit-claim-contender"; then
  echo "claim contender never waited on the owner's transaction lock" >&2
  exit 1
fi

touch "$test_tmp_dir/claim.release"
wait "$claim_owner_pid"
claim_owner_pid=""
wait "$claim_contender_pid"
claim_contender_pid=""

owner_result="$(sed -n '1p' "$test_tmp_dir/owner.out")"
contender_result="$(sed -n '1p' "$test_tmp_dir/contender.out")"
request_count="$(psql -v ON_ERROR_STOP=1 -qAt <<SQL
RESET ROLE;
SELECT COUNT(*)
FROM public.social_kit_requests
WHERE user_id = '$test_user' AND request_hash = '$request_hash';
SQL
)"

if [[ "$owner_result" != "acquired" ]]; then
  echo "expected owner=acquired, got: $owner_result" >&2
  exit 1
fi
if [[ "$contender_result" != "in_progress" ]]; then
  echo "expected contender=in_progress, got: $contender_result" >&2
  exit 1
fi
if [[ "$request_count" != "1" ]]; then
  echo "expected one durable request, got: $request_count" >&2
  exit 1
fi

request_id="$(psql -v ON_ERROR_STOP=1 -qAt <<SQL
SELECT id
FROM public.social_kit_requests
WHERE user_id = '$test_user' AND request_hash = '$request_hash';
SQL
)"

# Race the money-critical reservation RPC itself. Both sessions must receive
# the same five transaction IDs while the balance is deducted only once.
PGAPPNAME=social-kit-reserve-owner \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/reserve-owner.out" <<SQL &
BEGIN;
SET LOCAL ROLE service_role;
SELECT array_to_string(
  public.reserve_social_kit_request_bundle(
    '$request_id',
    '$test_user',
    ARRAY[8, 8, 8, 8, 35],
    ARRAY['scene 1', 'scene 2', 'scene 3', 'scene 4', 'video']
  ),
  ','
);
\! touch "$test_tmp_dir/reserve-owner.ready"
\! while [ ! -f "$test_tmp_dir/reserve.release" ]; do sleep 0.05; done
COMMIT;
SQL
reserve_owner_pid=$!

for _ in $(seq 1 100); do
  [[ -f "$test_tmp_dir/reserve-owner.ready" ]] && break
  sleep 0.05
done
if [[ ! -f "$test_tmp_dir/reserve-owner.ready" ]]; then
  echo "owner reservation did not reach the concurrency barrier" >&2
  exit 1
fi

PGAPPNAME=social-kit-reserve-contender \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/reserve-contender.out" <<SQL &
SET ROLE service_role;
SELECT array_to_string(
  public.reserve_social_kit_request_bundle(
    '$request_id',
    '$test_user',
    ARRAY[8, 8, 8, 8, 35],
    ARRAY['scene 1', 'scene 2', 'scene 3', 'scene 4', 'video']
  ),
  ','
);
SQL
reserve_contender_pid=$!

if ! wait_for_lock "social-kit-reserve-contender"; then
  echo "reservation contender never waited on the request row lock" >&2
  exit 1
fi

touch "$test_tmp_dir/reserve.release"
wait "$reserve_owner_pid"
reserve_owner_pid=""
wait "$reserve_contender_pid"
reserve_contender_pid=""
reserve_owner="$(sed -n '1p' "$test_tmp_dir/reserve-owner.out")"
reserve_contender="$(sed -n '1p' "$test_tmp_dir/reserve-contender.out")"

read -r final_balance transaction_count <<<"$(psql -v ON_ERROR_STOP=1 -qAt -F ' ' <<SQL
SELECT profile.credit_balance, COUNT(tx.id)
FROM public.profiles AS profile
LEFT JOIN public.credit_transactions AS tx
  ON tx.user_id = profile.id
WHERE profile.id = '$test_user'
GROUP BY profile.credit_balance;
SQL
)"

if [[ "$reserve_owner" != "$reserve_contender" ]]; then
  echo "concurrent reservations returned different transaction IDs" >&2
  exit 1
fi
if [[ "$(awk -F',' '{print NF}' <<<"$reserve_owner")" != "5" ]]; then
  echo "expected five reservation IDs, got: $reserve_owner" >&2
  exit 1
fi
if [[ "$final_balance" != "33" || "$transaction_count" != "5" ]]; then
  echo "reservation race double-charged: balance=$final_balance count=$transaction_count" >&2
  exit 1
fi

# An alternate key that enters claim before completion must be durably aliased
# before completion can remove the active-hash index entry. Both functions use
# the same semantic advisory lock, making this ordering deterministic.
PGAPPNAME=social-kit-alias-before-completion-owner \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/alias-before-completion.out" <<SQL &
BEGIN;
SET LOCAL ROLE service_role;
SELECT disposition
FROM public.claim_social_kit_request(
  '$test_user',
  'concurrent-completion-alias',
  '$request_hash'
);
\! touch "$test_tmp_dir/alias-before-completion.ready"
\! while [ ! -f "$test_tmp_dir/claim-completion.release" ]; do sleep 0.05; done
COMMIT;
SQL
claim_owner_pid=$!

for _ in $(seq 1 100); do
  [[ -f "$test_tmp_dir/alias-before-completion.ready" ]] && break
  sleep 0.05
done
if [[ ! -f "$test_tmp_dir/alias-before-completion.ready" ]]; then
  echo "alias-before-completion claim did not reach the barrier" >&2
  exit 1
fi

PGAPPNAME=social-kit-completion-after-alias-contender \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/completion-after-alias.out" <<SQL &
SET ROLE service_role;
SELECT public.complete_social_kit_request(
  '$request_id',
  '$test_user',
  200,
  '{"jobIds":["concurrent-job"]}'::JSONB,
  '{}'::JSONB
);
SQL
claim_contender_pid=$!

if ! wait_for_lock "social-kit-completion-after-alias-contender"; then
  echo "completion contender never waited on the semantic advisory lock" >&2
  exit 1
fi

touch "$test_tmp_dir/claim-completion.release"
wait "$claim_owner_pid"
claim_owner_pid=""
wait "$claim_contender_pid"
claim_contender_pid=""

alias_before_completion="$(sed -n '1p' "$test_tmp_dir/alias-before-completion.out")"
completion_after_alias="$(sed -n '1p' "$test_tmp_dir/completion-after-alias.out")"
read -r alias_replay alias_request_id <<<"$(
  psql -v ON_ERROR_STOP=1 -qAt -F ' ' <<SQL
SET ROLE service_role;
SELECT disposition, request_id
FROM public.claim_social_kit_request(
  '$test_user',
  'concurrent-completion-alias',
  '$request_hash'
);
SQL
)"

if [[ "$alias_before_completion" != "in_progress" || "$completion_after_alias" != "t" ]]; then
  echo "claim/completion ordering failed: alias=$alias_before_completion completion=$completion_after_alias" >&2
  exit 1
fi
if [[ "$alias_replay" != "replay" || "$alias_request_id" != "$request_id" ]]; then
  echo "pre-completion alternate key was not durably replay-bound" >&2
  exit 1
fi

IFS=',' read -r success_tx_id failure_tx_id cancel_tx_id success_cancel_tx_id _ <<<"$reserve_owner"
success_job_id="00000000-0000-0000-0000-000000000701"
failure_job_id="00000000-0000-0000-0000-000000000702"
cancel_job_id="00000000-0000-0000-0000-000000000703"
success_cancel_job_id="00000000-0000-0000-0000-000000000704"

psql -v ON_ERROR_STOP=1 -qAt <<SQL
INSERT INTO public.jobs (
  id, user_id, project_id, tool, status, credit_cost, credit_tx_id,
  created_at, started_at
) VALUES
  (
    '$success_job_id', '$test_user', NULL, 'scene', 'processing', 8,
    '$success_tx_id', now() - INTERVAL '1 hour', now() - INTERVAL '1 hour'
  ),
  (
    '$failure_job_id', '$test_user', NULL, 'scene', 'processing', 8,
    '$failure_tx_id', now() - INTERVAL '1 hour', now() - INTERVAL '1 hour'
  ),
  (
    '$cancel_job_id', '$test_user', NULL, 'scene', 'processing', 8,
    '$cancel_tx_id', now() - INTERVAL '1 hour', now() - INTERVAL '1 hour'
  ),
  (
    '$success_cancel_job_id', '$test_user', NULL, 'scene', 'processing', 8,
    '$success_cancel_tx_id', now() - INTERVAL '1 hour', now() - INTERVAL '1 hour'
  );

UPDATE public.jobs
SET fal_request_id = CASE id
      WHEN '$cancel_job_id'::UUID THEN 'fal-cancel-race'
      WHEN '$success_cancel_job_id'::UUID THEN 'fal-success-cancel-race'
    END
WHERE id IN ('$cancel_job_id'::UUID, '$success_cancel_job_id'::UUID);
SQL

# Success obtains the job lock first; concurrent stale cleanup must wait, then
# observe the committed completion and decline the refund.
PGAPPNAME=social-kit-transition-success-owner \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/success-owner.out" <<SQL &
BEGIN;
SET LOCAL ROLE service_role;
SELECT disposition
FROM public.complete_job_output_and_spend(
  '$success_job_id',
  'https://provider.example/concurrent-success.png',
  '{"image":{"url":"https://provider.example/concurrent-success.png"}}'::JSONB
);
\! touch "$test_tmp_dir/success-owner.ready"
\! while [ ! -f "$test_tmp_dir/success.release" ]; do sleep 0.05; done
COMMIT;
SQL
transition_owner_pid=$!

for _ in $(seq 1 100); do
  [[ -f "$test_tmp_dir/success-owner.ready" ]] && break
  sleep 0.05
done
if [[ ! -f "$test_tmp_dir/success-owner.ready" ]]; then
  echo "success transition did not reach the concurrency barrier" >&2
  exit 1
fi

PGAPPNAME=social-kit-transition-failure-contender \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/failure-contender.out" <<SQL &
SET ROLE service_role;
SELECT public.fail_job_and_refund(
  '$success_job_id',
  'stale cleanup raced success',
  now() - INTERVAL '30 minutes'
);
SQL
transition_contender_pid=$!

if ! wait_for_lock "social-kit-transition-failure-contender"; then
  echo "failure contender never waited on the success job lock" >&2
  exit 1
fi

touch "$test_tmp_dir/success.release"
wait "$transition_owner_pid"
transition_owner_pid=""
wait "$transition_contender_pid"
transition_contender_pid=""

success_owner="$(sed -n '1p' "$test_tmp_dir/success-owner.out")"
failure_contender="$(sed -n '1p' "$test_tmp_dir/failure-contender.out")"
read -r success_job_status success_tx_status success_output_count <<<"$(
  psql -v ON_ERROR_STOP=1 -qAt -F ' ' <<SQL
SELECT job.status, transaction_row.status, COUNT(output_row.id)
FROM public.jobs AS job
JOIN public.credit_transactions AS transaction_row
  ON transaction_row.id = job.credit_tx_id
LEFT JOIN public.outputs AS output_row ON output_row.job_id = job.id
WHERE job.id = '$success_job_id'
GROUP BY job.status, transaction_row.status;
SQL
)"

if [[ "$success_owner" != "completed" || "$failure_contender" != "already_completed" ]]; then
  echo "success-first race returned owner=$success_owner contender=$failure_contender" >&2
  exit 1
fi
if [[ "$success_job_status" != "completed" || "$success_tx_status" != "completed" || "$success_output_count" != "1" ]]; then
  echo "success-first race violated terminal invariant" >&2
  exit 1
fi

# Failure obtains the same job->transaction lock order first; late provider
# success must wait and then decline to create an output or complete the spend.
PGAPPNAME=social-kit-transition-failure-owner \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/failure-owner.out" <<SQL &
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.fail_job_and_refund(
  '$failure_job_id',
  'provider timeout',
  now() - INTERVAL '30 minutes'
);
\! touch "$test_tmp_dir/failure-owner.ready"
\! while [ ! -f "$test_tmp_dir/failure.release" ]; do sleep 0.05; done
COMMIT;
SQL
transition_owner_pid=$!

for _ in $(seq 1 100); do
  [[ -f "$test_tmp_dir/failure-owner.ready" ]] && break
  sleep 0.05
done
if [[ ! -f "$test_tmp_dir/failure-owner.ready" ]]; then
  echo "failure transition did not reach the concurrency barrier" >&2
  exit 1
fi

PGAPPNAME=social-kit-transition-success-contender \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/success-contender.out" <<SQL &
SET ROLE service_role;
SELECT disposition
FROM public.complete_job_output_and_spend(
  '$failure_job_id',
  'https://provider.example/late-success.png',
  '{"image":{"url":"https://provider.example/late-success.png"}}'::JSONB
);
SQL
transition_contender_pid=$!

if ! wait_for_lock "social-kit-transition-success-contender"; then
  echo "success contender never waited on the failure job lock" >&2
  exit 1
fi

touch "$test_tmp_dir/failure.release"
wait "$transition_owner_pid"
transition_owner_pid=""
wait "$transition_contender_pid"
transition_contender_pid=""

failure_owner="$(sed -n '1p' "$test_tmp_dir/failure-owner.out")"
success_contender="$(sed -n '1p' "$test_tmp_dir/success-contender.out")"
read -r failure_job_status failure_tx_status failure_output_count final_balance <<<"$(
  psql -v ON_ERROR_STOP=1 -qAt -F ' ' <<SQL
SELECT job.status,
       transaction_row.status,
       COUNT(output_row.id),
       profile.credit_balance
FROM public.jobs AS job
JOIN public.credit_transactions AS transaction_row
  ON transaction_row.id = job.credit_tx_id
JOIN public.profiles AS profile ON profile.id = job.user_id
LEFT JOIN public.outputs AS output_row ON output_row.job_id = job.id
WHERE job.id = '$failure_job_id'
GROUP BY job.status, transaction_row.status, profile.credit_balance;
SQL
)"

if [[ "$failure_owner" != "failed_refunded" || "$success_contender" != "terminal_conflict" ]]; then
  echo "failure-first race returned owner=$failure_owner contender=$success_contender" >&2
  exit 1
fi
if [[ "$failure_job_status" != "failed" || "$failure_tx_status" != "refunded" || "$failure_output_count" != "0" || "$final_balance" != "41" ]]; then
  echo "failure-first race violated terminal invariant" >&2
  exit 1
fi

# The legacy repair RPC owns the job lock first but must reject an active
# provider job without a refund. A provider success waits, then commits output
# and spend normally.
PGAPPNAME=social-kit-transition-cancel-owner \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/cancel-owner.out" <<SQL &
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.cancel_job_and_refund(
  '$cancel_job_id',
  'Active provider cancellation is disabled',
  'fal-cancel-race'
);
\! touch "$test_tmp_dir/cancel-owner.ready"
\! while [ ! -f "$test_tmp_dir/cancel.release" ]; do sleep 0.05; done
COMMIT;
SQL
transition_owner_pid=$!

for _ in $(seq 1 100); do
  [[ -f "$test_tmp_dir/cancel-owner.ready" ]] && break
  sleep 0.05
done
if [[ ! -f "$test_tmp_dir/cancel-owner.ready" ]]; then
  echo "cancel transition did not reach the concurrency barrier" >&2
  exit 1
fi

PGAPPNAME=social-kit-transition-cancel-success-contender \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/cancel-success-contender.out" <<SQL &
SET ROLE service_role;
SELECT disposition
FROM public.complete_job_output_and_spend(
  '$cancel_job_id',
  'https://provider.example/cancel-race-late.png',
  '{"image":{"url":"https://provider.example/cancel-race-late.png"}}'::JSONB
);
SQL
transition_contender_pid=$!

if ! wait_for_lock "social-kit-transition-cancel-success-contender"; then
  echo "success contender never waited on the cancellation job lock" >&2
  exit 1
fi

touch "$test_tmp_dir/cancel.release"
wait "$transition_owner_pid"
transition_owner_pid=""
wait "$transition_contender_pid"
transition_contender_pid=""

cancel_owner="$(sed -n '1p' "$test_tmp_dir/cancel-owner.out")"
cancel_success_contender="$(sed -n '1p' "$test_tmp_dir/cancel-success-contender.out")"
read -r cancel_job_status cancel_tx_status cancel_output_count final_balance <<<"$(
  psql -v ON_ERROR_STOP=1 -qAt -F ' ' <<SQL
SELECT job.status,
       transaction_row.status,
       COUNT(output_row.id),
       profile.credit_balance
FROM public.jobs AS job
JOIN public.credit_transactions AS transaction_row
  ON transaction_row.id = job.credit_tx_id
JOIN public.profiles AS profile ON profile.id = job.user_id
LEFT JOIN public.outputs AS output_row ON output_row.job_id = job.id
WHERE job.id = '$cancel_job_id'
GROUP BY job.status, transaction_row.status, profile.credit_balance;
SQL
)"

if [[ "$cancel_owner" != "not_cancellable" || "$cancel_success_contender" != "completed" ]]; then
  echo "cancel-first race returned owner=$cancel_owner contender=$cancel_success_contender" >&2
  exit 1
fi
if [[ "$cancel_job_status" != "completed" || "$cancel_tx_status" != "completed" || "$cancel_output_count" != "1" || "$final_balance" != "41" ]]; then
  echo "cancel-first race violated terminal invariant" >&2
  exit 1
fi

# Mirrored direction: once success owns the job lock, legacy cancellation
# repair must wait and then report the authoritative completion without refund.
PGAPPNAME=social-kit-transition-success-cancel-owner \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/success-cancel-owner.out" <<SQL &
BEGIN;
SET LOCAL ROLE service_role;
SELECT disposition
FROM public.complete_job_output_and_spend(
  '$success_cancel_job_id',
  'https://provider.example/success-before-cancel.png',
  '{"image":{"url":"https://provider.example/success-before-cancel.png"}}'::JSONB
);
\! touch "$test_tmp_dir/success-cancel-owner.ready"
\! while [ ! -f "$test_tmp_dir/success-cancel.release" ]; do sleep 0.05; done
COMMIT;
SQL
transition_owner_pid=$!

for _ in $(seq 1 100); do
  [[ -f "$test_tmp_dir/success-cancel-owner.ready" ]] && break
  sleep 0.05
done
if [[ ! -f "$test_tmp_dir/success-cancel-owner.ready" ]]; then
  echo "success-before-cancel transition did not reach the concurrency barrier" >&2
  exit 1
fi

PGAPPNAME=social-kit-transition-cancel-contender \
psql -v ON_ERROR_STOP=1 -qAt >"$test_tmp_dir/cancel-contender.out" <<SQL &
SET ROLE service_role;
SELECT public.cancel_job_and_refund(
  '$success_cancel_job_id',
  'Active provider cancellation is disabled',
  'fal-success-cancel-race'
);
SQL
transition_contender_pid=$!

if ! wait_for_lock "social-kit-transition-cancel-contender"; then
  echo "cancel contender never waited on the success job lock" >&2
  exit 1
fi

touch "$test_tmp_dir/success-cancel.release"
wait "$transition_owner_pid"
transition_owner_pid=""
wait "$transition_contender_pid"
transition_contender_pid=""

success_cancel_owner="$(sed -n '1p' "$test_tmp_dir/success-cancel-owner.out")"
cancel_contender="$(sed -n '1p' "$test_tmp_dir/cancel-contender.out")"
read -r success_cancel_job_status success_cancel_tx_status success_cancel_output_count final_balance <<<"$(
  psql -v ON_ERROR_STOP=1 -qAt -F ' ' <<SQL
SELECT job.status,
       transaction_row.status,
       COUNT(output_row.id),
       profile.credit_balance
FROM public.jobs AS job
JOIN public.credit_transactions AS transaction_row
  ON transaction_row.id = job.credit_tx_id
JOIN public.profiles AS profile ON profile.id = job.user_id
LEFT JOIN public.outputs AS output_row ON output_row.job_id = job.id
WHERE job.id = '$success_cancel_job_id'
GROUP BY job.status, transaction_row.status, profile.credit_balance;
SQL
)"

if [[ "$success_cancel_owner" != "completed" || "$cancel_contender" != "already_completed" ]]; then
  echo "success-before-cancel race returned owner=$success_cancel_owner contender=$cancel_contender" >&2
  exit 1
fi
if [[ "$success_cancel_job_status" != "completed" || "$success_cancel_tx_status" != "completed" || "$success_cancel_output_count" != "1" || "$final_balance" != "41" ]]; then
  echo "success-before-cancel race violated terminal invariant" >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 -qAt <<SQL
RESET ROLE;
DELETE FROM public.social_kit_requests WHERE user_id = '$test_user';
DELETE FROM public.profiles WHERE id = '$test_user';
SQL

echo "Social Kit concurrent claim contract passed"
