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
| Model | Tool | Tier | Credits | fal.ai Endpoint |
|-------|------|------|---------|-----------------|
| TRELLIS v1 | 3d-model | fast | 5 | fal-ai/trellis/multi |
| Tripo 2.5 | 3d-model (multi-photo fast) | fast | 10 | tripo3d/tripo/v2.5/multiview-to-3d |
| Meshy 5 | 3d-model | standard | 15 | fal-ai/meshy/v5/multi-image-to-3d |
| Hunyuan3D V3 | 3d-model | premium | 30 | fal-ai/hunyuan3d-v3/image-to-3d |
| birefnet | bg-remove | — | 1 | fal-ai/birefnet/v2 |
| aura-sr | enhance | — | 4 | fal-ai/aura-sr |
| bria-product-shot | scene | — | 8 | fal-ai/bria/product-shot |
| wan-i2v | video | — | 20 | wan/v2.6/image-to-video |
| bria-product-shot-hd | aplus | — | 8 | fal-ai/bria/product-shot |

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
