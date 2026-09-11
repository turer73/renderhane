# Social Kit v2 release runbook

Social Kit v2 changes the paid-request contract. The database must be prepared
while the old application is still live; merging to `master` triggers the
Vercel production deployment and therefore comes later.

## Compatibility matrix

| Application | Database | Result |
| --- | --- | --- |
| Old | Old | Existing behavior |
| Old | New | Safe; both migrations are additive |
| New | New | Target state |
| New | Old | Endpoint fails closed with HTTP 503 and creates no project/job/charge |

Never add a sequential `reserveCredits` fallback. It would restore partial
charging during a crash and invalidate the bundle-integrity guarantee.

## Required automated evidence

The `PostgreSQL Migration Contract` CI job must pass. It uses PostgreSQL 17 to:

1. bootstrap a disposable credit schema;
2. apply `20260830_reserve_credit_bundle.sql`;
3. apply `20260831_social_kit_request_idempotency.sql`;
4. run both SQL contract suites;
5. prove claim, bundle reservation, the durable 501st-row maintenance cursor,
   and both directions of the success-vs-refund and
   disabled-active-cancel-vs-success races with independent PostgreSQL
   sessions, including the claim-vs-completion semantic advisory lock;
6. reapply both migrations and rerun both suites and concurrency checks.

`Build` depends on that job, so a required green Build cannot bypass a broken
SQL contract. Build uses an explicit fail-closed prerequisite assertion because
GitHub otherwise treats a dependency-skipped required job as successful.

## Production order

Each external step requires explicit approval for the exact migration or SHA.

1. Confirm the PR SHA and that all Node, CodeQL, Vercel Preview, and PostgreSQL
   checks are green.
2. Inspect the production migration ledger read-only. Stop if it disagrees with
   the repository; do not guess or run a broad `db push` across drift.
3. With the old application still live, apply exactly these additive files in
   order. Apply each complete file as one transaction through the migration
   executor; never paste or commit its statements one by one:
   - `20260830_reserve_credit_bundle.sql`
   - `20260831_social_kit_request_idempotency.sql`
4. Verify the exact production capabilities:

   ```sql
   SELECT to_regprocedure(
     'public.reserve_credit_bundle(uuid,integer[],text[])'
   );
   SELECT to_regprocedure(
     'public.claim_social_kit_request(uuid,text,text)'
   );
   SELECT to_regprocedure(
     'public.reserve_social_kit_request_bundle(uuid,uuid,integer[],text[])'
   );
   SELECT to_regprocedure(
     'public.complete_social_kit_request(uuid,uuid,integer,jsonb,jsonb)'
   );
   SELECT to_regprocedure(
     'public.complete_job_output_and_spend(uuid,text,jsonb)'
   );
   SELECT to_regprocedure(
     'public.fail_job_and_refund(uuid,text,timestamp with time zone)'
   );
   SELECT to_regprocedure(
     'public.cancel_job_and_refund(uuid,text,text)'
   );
   SELECT to_regprocedure(
     'public.take_maintenance_scan_page(text,timestamptz,integer)'
   );
   SELECT to_regclass('public.social_kit_requests');
   SELECT to_regclass('public.social_kit_request_keys');
   SELECT to_regclass('public.maintenance_scan_cursors');

   SELECT COUNT(*) AS canonical_alias_mismatches
   FROM public.social_kit_requests AS request
   LEFT JOIN public.social_kit_request_keys AS request_key
     ON request_key.user_id = request.user_id
    AND request_key.idempotency_key = request.idempotency_key
    AND request_key.request_id = request.id
   WHERE request_key.request_id IS NULL;

   SELECT role_row.rolname,
          has_table_privilege(
            role_row.rolname,
            'public.social_kit_requests',
            'SELECT,INSERT,UPDATE,DELETE'
          ) AS requests_rw,
          has_table_privilege(
            role_row.rolname,
            'public.social_kit_request_keys',
            'SELECT,INSERT,UPDATE,DELETE'
          ) AS keys_rw,
          has_table_privilege(
            role_row.rolname,
            'public.maintenance_scan_cursors',
            'SELECT,INSERT,UPDATE,DELETE'
          ) AS maintenance_cursor_rw
   FROM pg_catalog.pg_roles AS role_row
   WHERE role_row.rolname IN ('service_role', 'anon', 'authenticated')
   ORDER BY role_row.rolname;
   ```

   All three table lookups must be non-NULL and the mismatch count must be zero.
   For the three privilege columns, `service_role` must return true/true/false;
   `anon` and `authenticated` must return false/false/false. Maintenance cursor
   state is intentionally RPC-only, including for `service_role`.

5. Verify `service_role` can execute each function and `PUBLIC`, `anon`, and
   `authenticated` cannot.
6. Record a `Production DB Ready` commit check for the exact PR SHA. This is a
   live-database assertion; ordinary CI or Preview cannot substitute for it.
   It is currently a procedural release gate, not a branch-protection required
   context; GitHub's mergeable state alone therefore does not prove DB readiness.
7. Resolve review conversations, then merge the approved SHA.
8. Confirm that Vercel production deployed the merge SHA.
9. Smoke-test with an authenticated user that has fewer than 67 credits. The
   expected result is HTTP 402 with no project, job, provider call, or balance
   change. Then run one approved paid request and replay the same idempotency
   key; both responses must match and only one five-job bundle may exist.

## Reliability boundary

`POST /api/v1/jobs` now requires an `Idempotency-Key` header for `social-kit`.
This is an intentional, fail-closed public API contract change: a missing or
invalid key returns HTTP 400 before project creation, reservation, or provider
submission. The public request hash uses the normalized locale and SHA-256 of
the exact `imageUrl`; reusing a key with a changed URL therefore returns HTTP
409 instead of silently opening another paid bundle. Update public API clients
before enabling the new application release.

The durable key survives browser reloads and is scoped to the authenticated
user, locale, and source fingerprint; network retries, ambiguous 5xx responses,
and concurrent tabs retain the same paid-request identity. Alternate keys that
arrive while the semantic request is active are permanently aliased under the
same advisory lock used by completion, so their later retry replays the
canonical response. After a `succeeded` or `partial` response, a different
same-hash key presented during the ten-minute terminal grace window also
replays, covering the upload/tab race after the active partial-index row is
released. A fresh key becomes a deliberate rerun after that window. A `failed`
response has no semantic grace, so a corrected request can start immediately.
Webhook completion atomically commits output, job status, and spend.
Failure/cron atomically commits job failure and refund under the same lock
order. Stale jobs with a durable output are repaired to completed rather than
mistakenly refunded.

Active paid-job cancellation is intentionally disabled: pending and processing
jobs return HTTP 409 before any provider call, job mutation, or ledger mutation.
fal.ai's HTTP 202 cancellation acknowledgement is only a request; an in-progress
model may still finish, while a queued cancellation does not supply the signed
terminal evidence needed for a safe refund. The remaining cancellation RPC is
only a repair path for rows that are already in the legacy terminal `cancelled`
state. Do not advertise active cancellation until a provider terminal-state
protocol and atomic ledger finalizer are implemented and contract-tested.

A provider queue call itself is external and cannot join the PostgreSQL
transaction. The provider adapter therefore separates enqueue from polling,
uses a 30-minute provider queue start timeout, and awaits durable request-ID
persistence before polling. Any later status/result retrieval error, including
401/403/404/422, is `indeterminate`, never a definitive rejection or permission
to refund. fal.ai's documented terminal failure shape is `COMPLETED` with a
non-empty `error` or `error_type`; defensive legacy `FAILED`, `ERROR`, or
`CANCELLED` states and successful completion without a usable output also use
the atomic failure/refund transition.
If fal.ai returns a request ID but its database update cannot be confirmed after
retries, the job is returned as `accepted_reconciliation_pending`. Main jobs,
including public sync submissions, carry a signed completion webhook. Both
pending states expose the durable job ID and, when known, the provider request
ID.

The stale-job cron deliberately does not refund a row with an accepted provider
request. It reports those rows as `providerReconciliationPending`; the signed
webhook normally finalizes main jobs. For an accepted talking-avatar TTS request,
the cron polls the durable TTS request ID and a single-winner CAS clears that old
ID before advancing the job to the signed main queue. Retrieval errors remain
pending; only an explicit terminal provider state authorizes failure/refund.

A durable `submission_attempted` marker with no acknowledged request ID remains
pending because the queue request may have run after its acknowledgement was
lost. At 24 hours the cron increments both
`providerSubmissionReviewRequired` and `providerReconciliationPending`, logs an
operator escalation, and does not refund. With a daily cron, the first alert may
arrive almost 48 hours after submission. Age is not terminal provider evidence
and is never a provider-level exactly-once claim.

Public API submissions surface either state as HTTP 202 with `Retry-After`, not
as a false terminal success or an HTTP 500 that invites a blind resubmission.
The Social Kit request remains `processing` while any child is indeterminate,
so the original key and every different key for the same semantic request are
blocked from opening a second paid bundle. The initial response is HTTP 202 and
the UI retains the original key. The stuck-job reconciler persists the final
durable response only after every child reservation is terminal; subsequent
retries then replay that response and the active semantic guard is released.
The configured production cron is daily, so an ambiguous parent can remain
processing beyond the 24-hour alert threshold until operator/provider evidence
resolves the child; do not promise an automatic terminal replay for this path.
Each of the three maintenance scans stores a composite `(created_at,id)`
cursor and a fixed cycle high-water mark. A run processes at most ten pages of
50; `scanTruncated` must alert operations, while the next cron resumes after the
durable cursor rather than restarting at the first 500 rows. The PostgreSQL
contract proves that a permanent first 500 cannot hide row 501.

A process crash or submit transport loss after the provider accepts a job but
before its request ID is received can still consume provider resources without
a locally reconcilable request ID. The pre-submit durable marker prevents an
immediate refund or duplicate cleanup; the 30-minute queue start timeout bounds
only how long a queued request may wait before processing begins. The 24-hour
local threshold raises an operations alert but deliberately does not terminate
the reservation. A provider-side idempotency token or durable outbox/resume
protocol is still required before provider invocation itself can be called
exactly-once.

This release does not claim site-wide HTTP exactly-once behavior. Generic
single-job, A+, talking-avatar, regeneration, batch, and non-Social-Kit public
API submissions still need the shared `paid_submission_requests` contract and
client key lifecycle in a separate P1 maintenance release. Their new 202 state
prevents a false terminal result, but it does not deduplicate a blind retry
after the complete HTTP response is lost.

## Rollback

Do not immediately roll the whole application back while Social Kit child jobs
are in flight. The previous deployment also lacks the refund-first webhook and
stuck-job reconciliation maintenance fixes.

1. Set `SOCIAL_KIT_SUBMISSIONS_DISABLED=true` and redeploy the current SHA. Its
   browser endpoint and public v1 route must return fail-closed HTTP 503 before
   claiming, project creation, charging, or provider submission.
2. Let current child jobs reach terminal state, run the stuck-job reconciler,
   and verify that no Social Kit reservation remains both `reserved` and tied
   only to failed/orphaned jobs.
3. Prefer a forward rollback that reverts the new Social Kit UI/submit behavior
   while retaining `process-webhook` and `stuck-jobs` maintenance fixes. Use the
   previous full Vercel deployment only after the active bundle and reservation
   count is zero.

Leave the additive database objects in place: the old application ignores them,
and dropping them while a new application instance may still be serving traffic
is unsafe.

If the database was not prepared, the new endpoint returns
`503 social_kit_temporarily_unavailable` with `Retry-After` and performs no paid
side effect. That is a safety guard, not permission to skip migration-first
release ordering.
