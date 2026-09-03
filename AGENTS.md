# Renderhane Agent Instructions

## Project

Renderhane is a production SaaS built with Next.js 16, TypeScript, Supabase, Cloudflare R2 and fal.ai. The active development focus on this branch is the **Manufacturing Relief** system.

Read these first:

1. `CLAUDE.md`
2. `docs/plans/2026-09-03-manufacturing-relief-system-research-and-plan.md`
3. `docs/manufacturing-relief-mvp.md`
4. GitHub issues `#53` through `#57`

## Product truth

Do not reduce this work to a generic image-to-3D feature.

The primary product is **Relief Pro**:

- real physical relief geometry,
- a UV artwork package aligned to the exact same coordinate system,
- real millimetre dimensions,
- flat back surface,
- optional magnet pocket, hanging hole or stand,
- server-generated and validated GLB / generic 3MF / STL,
- manufacturing report and explicit warnings.

The secondary product is **Dome**:

- 3D-printed contour base,
- UV-printed sticker,
- epoxy doming.

Never present Dome as real physical relief. Never merge the two product definitions.

## Core engineering decisions

- AI-generated GLB from Rodin, Hunyuan3D, TRELLIS, Tripo or Meshy is not a production file.
- The canonical source is a versioned 16-bit relief map, semantic layers and a parametric manufacturing recipe.
- AI may create masks, depth candidates, normals or suggestions. Deterministic code owns dimensions, topology, base, pockets, validation and export.
- Vercel/Next.js is the control plane. Native geometry processing belongs in a Docker worker.
- Keep the existing `outputs` path backward compatible. Manufacturing requires multi-artifact revisions.
- Browser GLB-to-STL conversion is convenience only, never manufacturing validation.
- Do not claim “production ready” unless digital validation gates pass. Physical validation remains a separate requirement.

## Current Phase 0 scope

Work on the benchmark and deterministic relief builder before UI integration.

Required first benchmark:

- Kapadokya front manufacturing master,
- 70 mm target width,
- 3.0 mm base,
- relief depths 0.6 / 1.0 / 1.4 / 1.8 mm,
- P1S and A1 mini physical tests,
- UV registration coupon,
- measured acceptance report.

Do not build the full editor, public API or Bambu-specific project 3MF before the deterministic CLI and benchmark are verified.

## Development workflow

1. **Plan/read-only review**: identify exact files, invariants and tests.
2. **Implement a small vertical slice** on `feature/manufacturing-relief-mvp`.
3. **Run an independent review** focused on manufacturing correctness, security and backward compatibility.
4. **Run automated verification**.
5. **Record limitations honestly**. A passing unit test is not a physical production validation.

DeepSeek, Claude Code and OpenCode are development accelerators, not sources of truth. Their output must be checked against tests, geometry metrics and physical samples.

## Verification commands

JavaScript/TypeScript:

```bash
npm ci
npm run type-check
npm run lint
npm test
```

Relief worker:

```bash
python -m pip install -r workers/relief/requirements-dev.txt
python -m pytest workers/relief/tests -q
```

When package-lock changes, preserve the repository's npm 10 compatibility rule documented in `CLAUDE.md`.

## Geometry acceptance rules

For any artifact described as production geometry:

- units and bounds must be explicit,
- back plane must be flat,
- mesh must be watertight/manifold,
- open edge count must be zero,
- winding must be consistent,
- volume must be positive,
- minimum base thickness must be preserved,
- relief maximum must not exceed the recipe,
- exports must be deterministic for identical inputs and engine version,
- report must include engine version, recipe hash and artifact hashes.

Warnings must downgrade the result to `needs_review`; never hide a failed check.

## API, database and credits

- Keep legacy tools operational.
- Use immutable manufacturing revisions.
- Separate AI-cost steps from deterministic rebuild/export steps.
- Do not keep credits reserved while a user manually edits a revision.
- Build, validate and export operations must be idempotent.
- Store secrets only in environment variables or provider credential stores.
- Never commit API keys, tokens, cookies, service-role credentials or private URLs.

## Agent permissions

- Planning/review agents should be read-only.
- Build agents may edit only inside the repository and must not push to `master`.
- Do not run destructive database, deployment or credential commands without explicit approval.
- Do not merge or deploy merely because an agent says the change is correct.

## Completion standard

A task is complete only when:

- the intended behavior is implemented,
- relevant tests pass,
- limitations are documented,
- no secret is committed,
- compatibility with existing Renderhane flows is checked,
- any claim of physical manufacturability is backed by a recorded physical test.
