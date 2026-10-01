# Provider recovery and exact regeneration

## Boundaries

This follow-up to the Opus review addresses findings 7–9. It changes backend
reliability, not manufacturing approval. Digital geometry validation remains
separate from P1S/A1 mini, UV/RIP/ICC and physical acceptance. No existing
customer job, credit balance or provider request is replayed to verify this work.

## Scheduler ownership

| Route | Owner | UTC schedule | Release state |
| --- | --- | --- | --- |
| `/api/cron/process-webhooks` | Existing Klipper cron | every 5 minutes | Observed live; not changed here |
| `/api/cron/stuck-jobs` | Existing Vercel cron | 00:00 daily | Existing schedule retained |
| `/api/cron/subscription-renew` | Existing Vercel cron | 06:00 daily | Existing schedule retained |
| `/api/cron/health` | Vercel cron | 00:00 and 12:00 daily | Added in code; needs deployment verification |
| `/api/cron/fal-scanner` | Vercel cron | Monday 09:00 | Added in code; needs deployment verification |

On 2026-10-01 the Vercel team API reported the existing team on Pro. No plan
change was made. Current [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
allow 100 jobs/project; old two-job Hobby notes are stale. Keep the external
webhook drainer out of `vercel.json` to avoid duplicate ownership. Migrating its
ownership is a separate operations change, not part of this patch.

Read-only evidence: Klipper crontab contains the five-minute wrapper schedule.
Supabase logs showed `dequeue_webhooks` HTTP 200 at 07:00:07, 07:05:01 and
07:10:01 UTC on 2026-10-01. This proves scheduled database access, not that a
specific customer's model finished, nor uninterrupted scheduler availability.
Supabase `pg_cron`/`pg_net` were not enabled. Do not add a second database cron.
Never copy the cron secret into source, command-line literals or PR comments.

All routes require `CRON_SECRET`. Health checks model discovery/credentials,
not paid inference, provider quota, or every model runner. Scanner uses metadata
and catalog reads. Alerts may send existing admin emails; no model generation
is initiated by these two monitoring routes.

## Accepted main requests

The cleanup scans stale jobs with a persistent keyset cursor. A known request
ID is polled using its stored endpoint; a matching main-stage marker is required
when present. Legacy avatar IDs without a stage are left for review because
they could belong to intermediate TTS rather than the final video.

The [fal queue contract](https://fal.ai/docs/documentation/model-apis/inference/queue)
uses `IN_QUEUE`, `IN_PROGRESS`, and `COMPLETED`. A matching `request_id` plus
`COMPLETED` with `error`/`error_type` is terminal provider evidence. Transport,
401/403/404/422/429 errors and unknown states are not evidence for a refund.
A completed success must yield a recognized public output URL. Unknown result
schemas retain the reservation and increment `providerResultReviewRequired`.

Recovered results/errors are durably admitted to `enqueue_webhook`. Admission
requires a valid positive queue receipt and increments `providerWebhooksQueued`;
it is **not** completion. The existing drainer performs the same job-bound,
row-locked output/spend or failure/refund transitions as a normal callback.
Duplicate callback/cron messages do not create a second charge or output.
Queue persistence errors leave the job pending; no new inference is submitted.

Each scanned job shares a 10-second AbortSignal across reads and writes.
Four workers drain a fetched page of at most 50 rows. Before advancing another
page's durable cursor, reserve 13 waves × 10 seconds = 130 seconds within the
180-second provider phase budget. Unused work resumes on the next invocation;
never skip half a fetched page just to meet a deadline. Database page-fetch
latency and later reservation/bundle cleanup remain additional runtime costs.

The existing avatar TTS recovery is distinct: after retrieving accepted TTS it
may submit the already-reserved main video once, behind a single-winner CAS.
Its HTTP admission is bounded too. A lost acknowledgement stays indeterminate;
it never authorizes another submission or an automatic age-based refund.
Missing request IDs older than 24 hours remain explicit manual-review cases.

Recovery latency is still daily cleanup + up to the five-minute webhook
interval, possibly more when scans span multiple invocations. This is not an
instant fallback. Shortening cleanup cadence or changing cron ownership needs
an operations decision and live verification.

## Exact regeneration

New async and sync jobs persist the resolved model key, not only a mutable tier.
Async jobs also retain source images, preprocessing flags, composition context,
voice/script/audio and validated logo extras. Regeneration retains the original
project only after its ownership can still be verified.

Replay explicitly selects user-facing fields. Never replay user identity,
admin email, credit reservation IDs, orchestration IDs or provider markers from
stored JSON. The authenticated user/email come from the current session.
Model key, stored endpoint and tool allowlist must agree; unavailable/ambiguous
legacy models return 409 before any charge rather than switching to a current
default with a different price. Named multi-image gaps do not shift view slots.

Legacy jobs without these snapshots cannot recover settings that were never
stored (old voice choices/composition context, for example). Known endpoint and
provider-input recovery is best effort; do not promise bit-identical AI outputs
or durable provider URLs. Retired or malformed inputs require a fresh request.
Model cost is recalculated under current pricing; model selection is preserved,
not a historical price guarantee. SRT voiceover and Social Kit retain their
dedicated orchestration flows.

## Release verification

Run type-check, lint, the complete Vitest suite and production build. Keep
regression coverage for owner/project isolation, exact model/extras/voice replay,
no privilege replay, provider identity, terminal evidence, transport failures,
durable queue admission, deadline/CAS behavior and cursor headroom/resumption.
Existing PostgreSQL completion/failure concurrency invariants are unchanged.
No migration is required; production SQL functions are not rewritten here.

After an explicitly authorized deployment, verify the deployed commit, cron
configuration and fresh scheduler database receipts without calling paid
generations or manually invoking a credit-mutating cleanup. A paid end-to-end
generation or replay of historical jobs needs its own approval. Until then,
new schedules and recovery behavior are code/test verified, not live-verified.

### Local verification — 2026-10-01

| Check | Result |
| --- | --- |
| `npm run type-check` | Passed, exit 0 |
| `npm run lint` | Passed, exit 0; zero warnings allowed |
| `npm test` | Passed, exit 0; 71 files, 858 tests |
| `npm run build` | Passed, exit 0; Next.js 16.3.6, 83 static pages |
| `git diff --check` | Passed, exit 0 |
| Independent read-only review | No remaining verified finding, including caller abort/late-result handling |

The final test/build run includes the SDK retry-backoff caller deadline fix.
An abort-aware wrapper bounds the caller even if SDK backoff sleeps do not
settle promptly, consumes late results/errors, and does not initiate an already
expired admission. Abort after HTTP admission can still be indeterminate; it
is not proof that the provider rejected or cancelled the request.

Existing local-build metadata-base and Vitest configuration deprecation
warnings remain; checks were not relaxed. No Python 3.11/3.13 matrix or fresh
PostgreSQL race test was run for this backend-only patch. Existing geometry
code and PostgreSQL atomic transition functions were not changed.

These results are local evidence only. Remote CI, deployment of this patch,
fresh monitoring schedules and authenticated customer completion remain
unverified. No production migration, plan upgrade, paid inference, balance
mutation or manual cleanup invocation was performed for verification.
