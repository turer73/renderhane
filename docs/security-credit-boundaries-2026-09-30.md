# Financial authority hardening — 2026-09-30

Scope: Opus findings 1–6, the public v1 image-count boundary, and the follow-up
trigger/referral/dependency hardening below. Prepared from
`ed9b258c076f85799c221c2364f9c807fc16d653`; tracked in PR #119.
This document is not evidence that the application has been deployed.
The user applied `20260929204937_harden_credit_authority.sql` manually; live
read-only checks confirmed its effective grants, RLS and reservation function.
The new follow-up migration is a separate release step. No paid generation,
payment, historical balance adjustment or subscription purchase is part of this work.

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
| Remote PostgreSQL 17 CI at `c26d551` | Passed, run 36670420052; a new head requires new CI |
| Live Supabase grants / security advisors | Read-only verification on Renderhane completed; follow-up findings below |

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
  only under ignored `artifacts/security-db`; it is not an application dependency.
  This local runner is not a PostgreSQL 17 concurrency test or a live Supabase test.

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

## Follow-up: trigger, referral and dependency hardening

- `20260930111146_harden_trigger_and_referral_boundaries.sql` fixes the API-key
  trigger search path and removes direct PUBLIC/anon/authenticated EXECUTE from
  both trigger functions. `handle_new_user` returns `trigger`: the old grant is
  unnecessary exposure, **not proof that an ordinary RPC could execute it**.
  Existing installed signup/API-key triggers continue working in role-level tests.
- Referral completion is service-only, serializes by beneficiary across all
  codes, and locks profile rows in UUID order. A completed beneficiary cannot
  receive another referral welcome bonus through a different code. Only one
  email-matching pending invitation is consumed; unrelated invitations remain.
  Direct links, the 10/5 default rewards and five-reward referrer cap remain.
  This is not a claim of protection against multiple-account farming.
- Historical referrals/balances are not deduplicated or rewritten. Existing
  duplicate history causes subsequent rewards to be rejected, not paid again.
- The disposable legacy test reproduces cross-code double rewards and consumption
  of an unrelated invite. The new contract test proves denial, idempotency,
  signup, installed triggers, matching-email behavior and cap behavior. Local
  PostgreSQL 18.3/PGlite execution and reapplication pass.
- The PostgreSQL 17 CI test uses two connections and an observed lock barrier
  (not timing guesses) for same-code, cross-code, shared-referrer-cap and inverse
  referral races. It checks balances and ledgers, runs again after reapplication,
  and refuses any database not named `security_contract`.
- Targeted npm updates fix `fast-uri` (3.1.8), `ip-address` (10.7.2),
  `brace-expansion` (1.1.21/5.0.12), `qs` (6.16.0) and `undici` (7.30.0).
  Express-related development dependencies are deduplicated within their existing
  declared ranges; no application top-level dependency range was changed.
  A clean npm 10 install and both full/production-only audits report **0 known
  vulnerabilities**. This does not prove the absence of undisclosed vulnerabilities.

## Release boundary

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

Current limitations: project listing omitted Renderhane, but direct project
lookup and read-only SQL on the verified ref succeeded. The migration history
list is empty despite the user-applied SQL; do not replay the whole historical
migration directory to repair that discrepancy. Both new migration files were
created with `supabase migration new` and exercised on an isolated database.
The application at the previous production commit still needs coordinated release:
the old referral route calls the RPC as a user and is incompatible with the
already-applied revocation. Do not restore public financial privileges as a workaround.

PR preview lacks branch-specific Supabase environment configuration. Its health
endpoint works, but authentication-dependent endpoints could not be accepted.
Do not copy production service credentials into Preview; use an explicitly
approved isolated test target. No new paid environment was created.

The Renderhane Supabase organization is on the Free plan. Its disabled leaked
password protection warning cannot be closed without the Pro-or-higher feature
([official requirement](https://supabase.com/docs/guides/auth/password-security)).
No paid upgrade was authorized or performed. Five server-only tables with RLS
and no client policies produce INFO advisories; adding permissive policies merely
to clear those messages would weaken isolation and is not a fix.

## Deferred, not silently marked fixed

- Cron scheduling and accepted-job reconciliation (Opus 7–8): need separate
  configuration/runtime evidence; catalog scanning is not job reconciliation.
- Regenerate request preservation (9): model/voice/extra fields still need review.
- The follow-up migration closes cross-code reward repetition; the original
  service-only RPC ACL alone did not fix that authenticated server-route abuse.
- Remesh/analysis pricing, displayed default credit cost, polling, translations,
  and dead-code cleanup are outside this critical patch.
- Restricting authority does not audit historical balances or prove no prior
  misuse. No historical financial records were altered.
- Relief geometry/physical manufacturing behavior is untouched; no new physical
  production claim is made.
