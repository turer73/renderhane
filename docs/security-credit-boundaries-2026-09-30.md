# Financial authority hardening — 2026-09-30

Scope: Opus findings 1–6, plus the public v1 image-count boundary. Prepared
locally from `ed9b258c076f85799c221c2364f9c807fc16d653`. This document is not
evidence that production has been patched. No production migration, provider
generation, payment, push, merge or deployment was performed for this change.

## What changes

| Finding | Boundary enforced |
| --- | --- |
| Profile balance/free-usage edits | Revoke table **and column** write grants from PUBLIC/anon/authenticated. Only display name, avatar, locale and use case remain user-editable, with own-row RLS. Remove the client profile-insert fallback. |
| Unverified subscriptions | Authenticated POST now returns 410 without touching subscriptions. GET/cancel and verified one-time credit checkout remain. `renew_subscription` is service-only. This does not implement recurring payment fulfillment. |
| Forged jobs/financial rows | Client writes to jobs, transactions, referrals and subscriptions are revoked; server writes and own-row reads remain. Existing jobs/balances are not rewritten or deleted. |
| Model/tool mismatch | Shared exact allowlist check runs in the session validator, public API and router before free allowance/reservation/provider calls. Unknown, prototype and retired registry-only keys fail closed. Defaults and current Meshy 7.1 remain; the separately authorized Admin Model Lab still uses its own input contract. |
| NULL-auth financial RPC access | Revoke EXECUTE from PUBLIC/anon/authenticated on seven financial/free-usage RPCs. The server referral route binds the beneficiary to `getUser()` before its privileged RPC. Reservations also require a service role and a non-null positive amount. |
| Same-origin active content | Proxy rejects HTML/JS/unapproved MIME types; downloads SVG/JSON/3D/archive payloads, applies nosniff and a restrictive sandbox CSP, and retains host/redirect restrictions. New proxy responses are no-store; no claim is made that already-cached old responses were purged. |
| Unbounded v1 image arrays | Same four-image ceiling as the session schema; each array entry must pass the existing public HTTP(S) URL validator. |

`TOOL_MODELS` is the public submission allowlist. A legacy entry remaining in
`MODELS` for historical job lookup does not reactivate it for new public jobs.
The old unknown-key fallback test was strengthened to require rejection; the
Kling selection test now uses the current O3 model and a separate test rejects
the retired key. No test is skipped, no cost/tolerance is relaxed.

## Verification

Local results on 2026-09-30:

| Check | Result |
| --- | --- |
| `npm test` | 64 files, 737 tests passed |
| `npm run test:coverage` | 64 files, 737 tests passed; no claim of complete application coverage |
| `npm run type-check` | Passed |
| `npm run lint` | Passed with zero ESLint warnings |
| `npm run build` | Passed; existing `metadataBase` warning remains |
| Isolated SQL reproduction, migration, contracts, reapplication | Passed on PostgreSQL 18.3/PGlite |
| CI YAML parse / `git diff --check` | Passed |
| Remote PostgreSQL 17 CI / live Supabase advisors | Not run |

- Application regression tests cover spoofed tool/model combinations on async
  and sync paths, no free-allowance/credit/provider side effects on rejection,
  valid Meshy 7.1, proxy isolation, retired activation and server referral auth.
- The disposable SQL bootstrap loads actual legacy migrations, payment-ID
  uniqueness, signup trigger, and current Social Kit migrations. It deliberately
  seeds broad table/column grants to reproduce the historical authorization bugs.
- `credit_authority_legacy_test.sql` reproduces direct credit/free-flag mutation,
  client job insertion, anonymous negative reservations and anonymous renewal;
  all demonstrations roll back.
- `credit_authority_test.sql` checks effective grants and actual role-level
  denials, own-row reads/allowed profile edits, signup, positive reservation,
  confirmation, exactly-once refund/payment/renewal and bundle compatibility.
  Applying the new migration a second time and rerunning the contract must pass.
- CI runs the new tests on a separate PostgreSQL 17 database named
  `security_contract`, without altering the existing migration/concurrency suite.
- Local SQL verification uses isolated PGlite 0.5.8 (PostgreSQL 18.3), installed
  only under ignored `artifacts/security-db`; application dependencies/lockfile
  are unchanged. This is not a PostgreSQL 17 CI run or a live Supabase test.

Reproduce on a **disposable local PostgreSQL database only**:

```sh
createdb security_contract
export PGDATABASE=security_contract
psql -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap_security_schema.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/credit_authority_legacy_test.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20260929204937_harden_credit_authority.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/credit_authority_test.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/20260929204937_harden_credit_authority.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/credit_authority_test.sql
```

## Release boundary — not executed

1. Review the diff, create a separately authorized PR, and require actual CI,
   including PostgreSQL 17, to pass. Confirm the selected project, deployed base,
   existing grants/policies and migration history before touching production.
2. Coordinate application and database release. The application should be
   upgraded first so referral completion uses the authenticated server route;
   applying the revokes while the old route is active would break that route.
   Application deployment alone does **not** close direct database access.
3. After separate approval, apply only the new migration through the established
   migration mechanism. Never run disposable bootstrap/reproduction tests on the
   real project. Do not re-grant public financial writes as a routine rollback;
   maintain containment and repair the server integration instead.
4. Verify effective grants and run Supabase security advisors on the intended
   project. Then run authorized smoke checks for profile editing, signup, normal
   submission and payment handling. Paid generations/payments need their own
   bounded test approval.

Current limitations: Renderhane live grants and remote advisors were not
verified; the available Supabase connection did not expose that project. No
local Docker-backed Supabase instance was available, so advisors/local CLI
schema-diff verification was not claimed. The migration file was created using
`supabase migration new` and verified through actual isolated SQL execution.

## Deferred, not silently marked fixed

- Cron scheduling and accepted-job reconciliation (Opus 7–8): need separate
  configuration/runtime evidence; catalog scanning is not job reconciliation.
- Regenerate request preservation (9): model/voice/extra fields still need review.
- One referral reward per beneficiary across different codes remains a separate
  business-rule fix; service-only RPC access is not a fix for authenticated
  repetition through the server route.
- Remesh/analysis pricing, displayed default credit cost, polling, translations,
  dependency audit and dead-code cleanup are outside this critical patch.
- Restricting authority does not audit historical balances or prove no prior
  misuse. No historical financial records were altered.
- Relief geometry/physical manufacturing behavior is untouched; no new physical
  production claim is made.
