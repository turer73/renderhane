# Renderhane — Project Memory

## Project Overview
E-commerce AI visual studio (SaaS). Generates 3D models, product photos, videos from single/multi-photo uploads.
- **Stack:** Next.js 16 + TypeScript + Tailwind CSS + Supabase + Cloudflare R2 + fal.ai
- **Domain:** https://www.renderhane.com (production)
- **Locales:** TR (default) + EN via next-intl

## Deployment
- **Vercel Account:** `3d-labx-8246` (3d-labx-8246s-projects)
- **Project:** `renderhane` on Vercel
- **GitHub:** `turer73/renderhane` → auto-deploy on push to `master`
- **Domain:** `renderhane.com` → 307 redirect → `www.renderhane.com`
- **Env vars:** Set via `npx vercel env add` — must strip quotes and `\n` from .env.local before adding
- **Second Vercel account:** `turgut-7032` exists but is for OTHER projects, not renderhane

## Key Accounts & Services
- **Supabase:** `byrovuwvzvzipwntounn.supabase.co`
- **Cloudflare:** DNS + R2 bucket `renderhane-assets` (assets.renderhane.com)
- **fal.ai:** AI model inference (TRELLIS v1/v2, Hunyuan3D, birefnet, etc.)
- **iyzico:** Payment gateway (Turkish market)
- **Resend:** Transactional emails
- **Admin email:** `turgut.urer@gmail.com`

## Architecture
```
src/
├── app/[locale]/(marketing)/  — Landing, blog, legal pages
├── app/[locale]/(app)/app/    — Dashboard (auth required)
├── app/[locale]/(auth)/       — Login, auth callback
├── app/api/                   — API routes (jobs, payments, webhooks, admin)
├── components/app/            — Dashboard components
├── components/landing/        — Landing page sections
├── components/ui/             — shadcn/ui primitives
├── lib/fal/models.ts          — AI model configs + credit costs
├── lib/payments/iyzico.ts     — Payment packages + iyzico SDK
├── lib/credits/engine.ts      — Credit reserve/spend/refund
├── lib/supabase/              — Client, server, admin, middleware
├── hooks/use-job-polling.tsx   — Real-time job status polling
└── messages/{tr,en}.json      — i18n translations
```

## AI Models & Credit Costs
**Kanonik kaynak: `src/lib/fal/models.ts` (MODELS + TOOL_MODELS)** — asagisi sadece ozet, tam liste ~40 model.
| Model | Tool | Tier | Credits | fal.ai Endpoint |
|-------|------|------|---------|-----------------|
| TRELLIS v1 | 3d-model | fast | 5 | fal-ai/trellis/multi |
| Meshy 6 | 3d-model | standard | 18 | fal-ai/meshy/v6/image-to-3d |
| Hunyuan3D V3.1 Pro | 3d-model | premium | 40 | fal-ai/hunyuan-3d/v3.1/pro/image-to-3d |
| birefnet | bg-remove | — | 1 | fal-ai/birefnet/v2 |
| Recraft Crisp | enhance | — | 3 | fal-ai/recraft/upscale/crisp |
| bria-product-shot | scene | — | 8 | fal-ai/bria/product-shot |
| wan-i2v | video | — | 20 | fal-ai/wan/v2.7/image-to-video |
| Kling O3 Pro | video | — | 20 | fal-ai/kling-video/o3/pro/image-to-video |
| Seedance 2.0 | video | premium | 50 | bytedance/seedance-2.0/image-to-video |
| Ideogram V4 | text-to-image | — | 5 | ideogram/v4 |
| Seedream 5.0 Lite | text-to-image | — | 5 | fal-ai/bytedance/seedream/v5/lite/text-to-image |

**Dis-namespace notu:** fal'da bazi partner modelleri `fal-ai/` oneksiz yasar: `ideogram/v4`, `bytedance/seedance-2.0/*`, `bytedance/seedream/v5/pro/*`, `openai/gpt-image-2`, `google/gemini-omni-flash`, `tripo3d/*`. Endpoint-varlik dogrulamasi: `https://fal.ai/models/<id>` 200/404 (queue.fal.run'a bos POST GUVENILMEZ — alt-yol ne olursa olsun 200 IN_QUEUE doner).

## Pricing Packages (KDV dahil)
| Package | Credits | Price | ₺/Credit |
|---------|---------|-------|----------|
| Starter | 100 | ₺199 | ₺1.99 |
| Standard | 300 | ₺499 | ₺1.66 |
| Pro | 800 | ₺999 | ₺1.25 |

## Database
- **Migrations:** `supabase/migrations/001-007`
- **007_security_hardening.sql** — MUST be run in Supabase SQL Editor (adds auth.uid() checks to all RPC functions)
- All credit operations use SECURITY DEFINER + FOR UPDATE row locking
- RLS enabled on all tables

## Important Notes
- **npm surumu tuzagi:** CI node 22 + npm 10 kullanir. Lokal npm 11'in `npm install`'i lockfile'daki `@rolldown/binding-wasm32-wasi` altindaki nested `@emnapi/*@1.10.0` entry'lerini SILER → CI'da `npm ci` EUSAGE ile kirilir (master 1-11 Tem 2026 arasi bu yuzden kirmiziydi). `npm install` sonrasi lockfile diff'inde bu entry'ler silindiyse `npx npm@10 install --package-lock-only` ile geri uret, dogrulama: `npx npm@10 ci --dry-run`.
- **fal cagri sozlesmesi:** `FalProvider.subscribe/submit(endpointId, input)` — `input` CIPLAK model girdisidir; provider kendisi `{ input }` diye sarar. `{ input: {...} }` gecirmek cift-sarmalama yapar, fal 422 `image_url Field required` doner (9 cagri yeri 16 Haz–12 Tem 2026 arasi bu yuzden oluydu).
- `.env.local` has quotes and `\n` artifacts — when adding to Vercel, strip them: `value="${value%\"}"; value="${value#\"}"; value="${value%\\n}"`
- `renderhane.com` A record → `76.76.21.21` (Vercel IP)
- `www` CNAME → `cname.vercel-dns.com`
- Supabase redirect URLs must include BOTH `renderhane.com` and `www.renderhane.com` variants
- Bottom nav has 4 items (mobile), admin link is in sidebar only
- Cookie banner uses localStorage, consent checkbox on login form
- Free 20 credits on signup + referral system (max 5 rewards per referrer)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
