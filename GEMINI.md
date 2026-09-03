# Renderhane — Gemini Project Context

@./AGENTS.md

## Required project references

Before making recommendations or edits for Manufacturing Relief, read:

- `docs/plans/2026-09-03-manufacturing-relief-system-research-and-plan.md`
- `docs/manufacturing-relief-mvp.md`
- `docs/plans/2026-09-03-agent-assisted-relief-development.md`
- GitHub issues `#53` through `#57`

## Gemini's preferred role

Gemini is primarily the multimodal and large-context review layer for this branch.

Use it to:

- compare a front manufacturing master with masks, depth candidates and the edited 16-bit relief map,
- detect perspective, cast-shadow, halo, detached-island, text/logo and silhouette problems,
- compare UV colour artwork, white mask, varnish mask and contour alignment,
- review photographs of P1S, A1 mini and UV calibration samples,
- inspect broad repository impact before a cross-cutting change,
- produce structured evidence tables rather than aesthetic opinions.

Do not use visual plausibility as proof of manufacturability. A convincing render can still have wrong dimensions, open edges, insufficient thickness, invalid topology or unacceptable UV registration.

## Evidence hierarchy

1. Physical measurements and recorded print tests
2. Deterministic geometry validation and automated tests
3. Pixel/mm registration measurements
4. Independent code review
5. Multimodal visual review
6. Model opinion

Never reverse this order.

## Safe operating mode

- Review first; edit only when explicitly assigned.
- Do not access or print `.env`, API keys, cookies, service-role credentials or private customer assets.
- Do not deploy, migrate production databases or push to `master`.
- Keep Relief Pro and Dome as separate products.
- Report uncertainty and failed checks explicitly.
