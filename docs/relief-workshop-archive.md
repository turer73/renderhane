# Relief Workshop: archive-only mode

## Scope

The legacy Relief Pro Workshop is retired as a submission interface, not deleted.
The existing admin-only `/[locale]/app/relief` page becomes **Relief Pro Arşivi** /
**Relief Pro Archive** in navigation. Historical revisions, previews and artifact
downloads remain available through the existing authenticated, owner-scoped API.

This change does not implement the proposed Meshy-based parametric relief editor.
It does not delete or migrate database records, input files, artifacts, geometry
engines or worker code. It does not grant physical manufacturing approval.

## Enforced contract

- `workshop-lifecycle.ts` is the shared code-level policy: `isWorkshopReadOnly()`
  returns `true`. Reopening submissions requires a reviewed code change.
- New revision and retry POST requests fail with HTTP `409` and
  `workshop_read_only`, before reading their body or contacting the worker.
- Fresh session, admin and same-origin checks remain in force. Unauthenticated,
  unauthorized and cross-origin requests retain their respective 401/403 errors.
- List, detail and artifact GET requests retain authentication, server-derived
  ownership, strict response parsing and artifact type/length/hash validation.
- `RELIEF_WORKSHOP_ENABLED=true` now permits the configured archive connection;
  it cannot override the read-only gate. Missing configuration or worker errors
  are displayed as unavailable reads, never as proof that records were deleted.
- Creation controls and retry buttons are hidden; preview controls and download
  links remain. Existing browser tabs cannot bypass the server POST gate.

## Operational boundary

This is an application/API change, not a worker shutdown. Already queued or
running work is **not canceled**. A separately authorized caller possessing the
worker credentials can still use the unchanged worker API. Worker credentials,
storage, processes and configuration are not changed by this PR.

Merge and deployment are separate actions. Until this code is deployed, the live
application is unchanged. Do not claim a production shutdown from a draft PR.

## Regression coverage and rollback

Real-default archive tests cover blocked create/retry requests, unread request
bodies, retained authentication/ownership, list/detail reads, verified downloads,
navigation labels and the archive UI. Legacy write-path tests are preserved with
an explicit test-only policy override, so the retained code does not lose its
security/transport coverage. The shipping policy is not environment-controlled.

Rollback is a reviewed code revert and deployment, not a data restore. No existing
records or artifacts are removed by this change. Any resumed processing still
requires its original digital and physical validation gates.
