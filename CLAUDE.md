# Renderhane — Project Memory

## Project Overview
E-commerce AI visual studio (SaaS). Generates 3D models, product photos, videos from single/multi-photo uploads.
- **Stack:** Next.js 16 + TypeScript + Tailwind CSS 4 + Supabase + Cloudflare R2 + fal.ai
- **Domain:** https://www.renderhane.com (production)
- **Locales:** TR (default) + EN via next-intl
- **Node:** >=20.9.0 (CI uses node 22 + npm 10)

## Quick Reference

```bash
npm run dev          # Dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint (--max-warnings=0, zero tolerance)
npm run type-check   # tsc --noEmit
npm test             # Vitest unit tests (src/**/__tests__/**/*.test.ts)
npm run test:e2e     # Playwright E2E tests (e2e/*.spec.ts)
```

## Deployment
- **Vercel Account:** `3d-labx-8246` (3d-labx-8246s-projects)
- **Project:** `renderhane` on Vercel
- **GitHub:** `turer73/renderhane` → auto-deploy on push to `master`
- **Domain:** `renderhane.com` → 308 redirect → `www.renderhane.com`
- **Env vars:** Set via `npx vercel env add` — must strip quotes and `\n` from .env.local before adding
- **Second Vercel account:** `turgut-7032` exists but is for OTHER projects, not renderhane
- **Sentry:** Integrated via `@sentry/nextjs` — source maps uploaded at build time when `SENTRY_AUTH_TOKEN` is set

## Key Accounts & Services
- **Supabase:** `byrovuwvzvzipwntounn.supabase.co`
- **Cloudflare:** DNS + R2 bucket `renderhane-assets` (assets.renderhane.com)
- **fal.ai:** AI model inference (TRELLIS, Hunyuan3D, FLUX, Kling, Veo, etc.)
- **iyzico:** Payment gateway (Turkish market)
- **Resend:** Transactional emails
- **Upstash:** Redis-based rate limiting (`@upstash/ratelimit`)
- **Admin email:** `turgut.urer@gmail.com`

## Architecture
```
src/
├── app/[locale]/(marketing)/   — Landing, blog, legal, tool SEO pages
├── app/[locale]/(app)/app/     — Dashboard (auth required)
├── app/[locale]/(auth)/        — Login, onboarding, auth callback
├── app/[locale]/embed/         — Frameable output embeds
├── app/api/                    — API routes (jobs, payments, webhooks, admin, v1)
│   ├── jobs/                   — Job submit, status, cancel, regenerate, remesh
│   ├── payments/               — iyzico checkout + callback
│   ├── webhook/                — fal.ai + iyzico webhooks
│   ├── v1/                     — Public API (API key auth)
│   ├── admin/                  — Admin endpoints (user mgmt, diagnostics)
│   ├── cron/                   — Scheduled jobs (stuck-jobs, health, subscription-renew)
│   └── ...                     — credits, referral, upload, blog, analyze, integrations
├── components/
│   ├── app/                    — Dashboard components (upload, sidebar, tool panels)
│   ├── landing/                — Landing page sections (hero, pricing, features)
│   ├── ui/                     — shadcn/ui primitives (New York style, Zinc theme)
│   ├── auth/                   — Auth components
│   ├── output/                 — Job output display (3D viewer, video, image)
│   ├── projects/               — Project management
│   ├── viewer/                 — React Three Fiber 3D viewer
│   ├── blog/                   — Blog components
│   ├── admin/                  — Admin panel
│   └── providers/              — Context providers
├── lib/
│   ├── fal/models.ts           — AI model configs + credit costs (canonical source)
│   ├── fal/smart-router.ts     — Routes requests to correct fal.ai model
│   ├── fal/scanner.ts          — fal.ai endpoint availability scanner
│   ├── ai/fal-provider.ts      — fal.ai client abstraction
│   ├── jobs/submit.ts          — Job submission with credit reservation
│   ├── jobs/orchestrate.ts     — Multi-step job orchestration (social-kit)
│   ├── jobs/process-webhook.ts — Webhook processing logic
│   ├── credits/engine.ts       — Credit reserve/spend/refund (atomic)
│   ├── payments/iyzico.ts      — Payment packages + iyzico SDK
│   ├── supabase/{client,server,admin}.ts — Supabase client hierarchy
│   ├── supabase/middleware.ts   — Session refresh middleware
│   ├── prompts/compose.ts      — AI-powered prompt enhancement
│   ├── prompts/presets.ts      — Prompt templates per tool
│   ├── r2/upload.ts            — Cloudflare R2 storage
│   ├── email/resend.ts         — Email via Resend
│   ├── security/safe-download.ts — SSRF-safe URL fetching
│   ├── rate-limit.ts           — Upstash rate limiter
│   ├── api-keys/               — Public API key management
│   ├── validations/job-submit.ts — Request validation schemas
│   ├── agents/                 — AI agent support (OpenAI-based)
│   └── integrations/shopify/   — Shopify integration
├── hooks/use-job-polling.tsx   — Real-time job status polling (2.5s interval)
├── i18n/
│   ├── routing.ts              — Locale config: ["tr", "en"], default "tr"
│   ├── request.ts              — Server-side i18n request handler
│   └── navigation.ts           — Client-side nav utilities
├── messages/{tr,en}.json       — i18n translations (namespace-based)
└── middleware.ts               — i18n routing + security headers + auth session refresh
```

## AI Models & Credit Costs
**Canonical source: `src/lib/fal/models.ts` (MODELS + TOOL_MODELS)** — the table below is a summary; full list is ~45 models.

### Tools & Default Models
| Tool | Description | Models (count) |
|------|-------------|----------------|
| `3d-model` | 3D from image(s) | 10 (TripoSR, TRELLIS v1/2, Meshy 6, Tripo, Hunyuan3D, Rodin) |
| `bg-remove` | Background removal | 2 (Bria RMBG, BiRefNet) |
| `enhance` | Image upscale | 2 (Recraft Crisp, Aura-SR) |
| `scene` | Product scene generation | 3 (Bria, Ideogram, Nano Banana Pro) |
| `video` | Image/text to video | 4 (Wan, Kling O3, Veo 3.1) |
| `image-edit` | AI image editing | 6 (FLUX Kontext, Nano Banana, Seedream, FLUX.2 Pro) |
| `text-to-image` | Text to image | 7 (FLUX Schnell/Dev/2Pro, Nano Banana, Ideogram V4, Seedream) |
| `inpainting` | Selective fill | 1 (FLUX Fill) |
| `object-removal` | Remove objects | 1 |
| `qr-code` | AI artistic QR | 1 (illusion-diffusion) |
| `talking-avatar` | Lip-sync avatar | 2 (OmniHuman, Kling Avatar) |
| `logo` | Logo generation | 2 (Recraft V4.1 PNG/SVG) |
| `social-kit` | Scene + video combo | Orchestration (no own models) |
| `virtual-tryon` | Clothing try-on | 1 (FASHN) |
| `aplus` | A+ e-commerce content | 1 (Bria HD) |

**fal namespace note:** Some partner models live without `fal-ai/` prefix: `ideogram/v4`, `bytedance/seedance-2.0/*`, `tripo3d/*`. Endpoint existence check: `https://fal.ai/models/<id>` returns 200/404 (empty POST to queue.fal.run is UNRELIABLE — always returns 200 IN_QUEUE).

## Pricing Packages (KDV dahil)
| Package | Credits | Price | ₺/Credit |
|---------|---------|-------|----------|
| Starter | 100 | ₺199 | ₺1.99 |
| Standard | 300 | ₺499 | ₺1.66 |
| Pro | 800 | ₺999 | ₺1.25 |

## Database
- **Migrations:** `supabase/migrations/` (001–021 + dated migrations)
- **007_security_hardening.sql** — MUST be run in Supabase SQL Editor (adds auth.uid() checks to all RPC functions)
- All credit operations use SECURITY DEFINER + FOR UPDATE row locking
- RLS enabled on all tables
- Key tables: `users`, `jobs`, `credits`, `projects`, `outputs`, `payments`, `referrals`, `blog_posts`, `blog_comments`, `api_keys`, `subscriptions`, `webhook_queue`

## Testing

### Unit Tests (Vitest)
- Config: `vitest.config.ts`
- Pattern: `src/**/__tests__/**/*.test.ts` (co-located `__tests__` dirs)
- Environment: `node`
- Coverage: V8 provider, covers `src/lib/**/*.ts`
- Run: `npm test` (single run), `npm run test:watch` (watch mode)
- 19 test files covering: credit engine, smart-router, models, job submission, payments, prompts, validations, security, rate-limiting, SEO, R2 uploads, Shopify integration

### E2E Tests (Playwright)
- Config: `playwright.config.ts`
- Pattern: `e2e/*.spec.ts` (+ `e2e/auth.setup.ts` for auth)
- Browser: Chromium (Desktop Chrome)
- Auth: Supabase login via setup project, stored in `e2e/.auth/user.json`
- Run: `npm run test:e2e`
- Tests: login flow, tool grid, tool pages, tool submission, AdSense/SEO

## Code Conventions

### File & Naming
- Files: kebab-case (`photo-upload.tsx`, `smart-router.ts`)
- Components: PascalCase exports
- Hooks: `use-` prefix, camelCase function (`useJobPolling`)
- Path alias: `@/*` → `./src/*`

### TypeScript
- Strict mode enabled
- `interface` for component props and data shapes
- Explicit types for function signatures
- `server-only` import in sensitive server modules (admin client, etc.)

### React & Next.js
- `"use client"` directive only where needed (client interactivity)
- Server components are default — use async/await for data fetching
- Supabase client hierarchy: `client.ts` (browser) → `server.ts` (server components/actions) → `admin.ts` (API routes, bypasses RLS)
- `next-intl` for all user-facing strings — never hardcode text

### Styling
- Tailwind CSS 4 with PostCSS
- `cn()` utility from `@/lib/utils` (clsx + tailwind-merge)
- shadcn/ui components (New York style, Zinc colors, CSS variables)
- Dark mode via `next-themes` (attribute: "class")
- Mobile-first responsive (Tailwind breakpoints)

### Linting
- ESLint 9 flat config with `eslint-config-next` (core-web-vitals + TypeScript)
- Zero warnings policy (`--max-warnings=0`)
- `@next/next/no-img-element` disabled for OG image routes

## Key Patterns

### Credit Flow (Atomic)
```
Reserve → Job Submit → fal.ai → Webhook → Spend/Refund
```
- `reserveCredits()` → PostgreSQL RPC with FOR UPDATE locking
- `spendCredits()` on success, `refundCredits()` on failure
- Prevents double-spending race conditions

### Job Pipeline
```
Upload → Validate → Reserve Credits → Submit to fal.ai (async) →
  Webhook callback → Process result → Store in R2 → Save output → Spend credits
```
- Status: `pending` → `processing` → `completed`/`failed`
- Polling: `useJobPolling` hook (2.5s interval via JobPollingProvider)
- Custom event: `job-submitted` for immediate UI updates
- Webhook: `FAL_WEBHOOK_SECRET` validation required

### Smart Router
- `src/lib/fal/smart-router.ts` — maps `(tool, tier, modelKey)` → fal.ai endpoint + params
- Abstracts model differences (parameter names, defaults, multi-image handling)
- `TOOL_MODELS` defines which models are available per tool in the UI
- `MODELS` is the full registry (includes unlisted models for API/legacy access)

### fal.ai Call Convention
**CRITICAL:** `FalProvider.subscribe/submit(endpointId, input)` — `input` is the BARE model input; the provider wraps it as `{ input }` internally. Passing `{ input: {...} }` causes double-wrapping → fal returns 422 `image_url Field required`.

### i18n
- Locales: `tr` (default), `en`
- Route: `/[locale]/...` (next-intl dynamic segment)
- Translations: `src/messages/{tr,en}.json` (namespace-based)
- Server: `getTranslations()` from `next-intl/server`
- Client: `useTranslations()` via `NextIntlClientProvider`
- All user-facing text MUST go through i18n — add keys to both `tr.json` and `en.json`

### Security
- CSP headers in middleware (frame-ancestors conditional for embed routes)
- HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy in `vercel.json`
- SSRF protection: `safe-download.ts` validates URLs before fetching
- Rate limiting: Upstash Redis-backed per-IP/user
- API keys: max 5 active per user (enforced by DB trigger)
- Webhook secrets: `FAL_WEBHOOK_SECRET` for fal.ai, iyzico signature verification

### Vercel Cron Jobs
Defined in `vercel.json`:
- `/api/cron/stuck-jobs` — daily at midnight (cleanup stale jobs)
- `/api/cron/subscription-renew` — daily at 06:00 (renew subscriptions)

## Environment Variables
See `.env.local.example` for the full list. Key groups:
- **App:** `NEXT_PUBLIC_APP_URL`
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **fal.ai:** `FAL_KEY` (format: `key_id:key_secret`), `FAL_WEBHOOK_SECRET`
- **iyzico:** `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`
- **R2:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
- **Sentry:** `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (optional, for source maps)

## Important Notes
- **npm version trap:** CI uses node 22 + npm 10. Local npm 11's `npm install` DELETES nested `@emnapi/*@1.10.0` entries under `@rolldown/binding-wasm32-wasi` from the lockfile → `npm ci` in CI fails with EUSAGE. After `npm install`, if lockfile diff shows these entries deleted, regenerate with `npx npm@10 install --package-lock-only`. Verify with `npx npm@10 ci --dry-run`.
- `.env.local` has quotes and `\n` artifacts — when adding to Vercel, strip them: `value="${value%\"}"; value="${value#\"}"; value="${value%\\n}"`
- `renderhane.com` A record → `76.76.21.21` (Vercel IP)
- `www` CNAME → `cname.vercel-dns.com`
- Supabase redirect URLs must include BOTH `renderhane.com` and `www.renderhane.com` variants
- Bottom nav has 4 items (mobile), admin link is in sidebar only
- Cookie banner uses localStorage, consent checkbox on login form
- Free 20 credits on signup + referral system (max 5 rewards per referrer)
- Marketing tool pages use Turkish slugs (`/araclar/3d-model`, `/araclar/video-olustur`, etc.)

## Dependencies (Key)
| Package | Version | Purpose |
|---------|---------|---------|
| `next` | ^16.3.0 | Framework |
| `react` | 19.2.3 | UI library |
| `@supabase/ssr` | ^0.8.0 | Supabase SSR auth |
| `@fal-ai/client` | ^1.9.3 | fal.ai AI inference |
| `@sentry/nextjs` | ^10.72.0 | Error tracking |
| `@react-three/fiber` | ^9.5.0 | 3D rendering |
| `@react-three/drei` | ^10.7.7 | 3D utilities |
| `three` | ^0.183.1 | 3D engine |
| `next-intl` | ^4.9.1 | i18n |
| `radix-ui` | ^1.4.3 | Headless UI primitives |
| `openai` | ^6.34.0 | AI agents (prompt enrichment) |
| `vitest` | ^4.1.8 | Unit testing |
| `@playwright/test` | ^1.59.1 | E2E testing |
| `shadcn` | ^4.19.0 | Component CLI |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
