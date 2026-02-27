# SEO + GA4 + Search Console Setup — Design Doc

**Date:** 2026-02-28
**Status:** Approved

## Context
Renderhane has zero SEO infrastructure: no sitemap, robots.txt, OG meta, structured data, analytics, or Search Console. This design adds all foundational SEO + analytics in one pass.

## Decisions
- **Analytics:** GA4 via `next/script` (ID: G-PLZ6ZW54KV), no extra deps
- **Search Console:** HTML meta tag verification
- **Sitemap:** Next.js native `sitemap.ts` with TR/EN alternates
- **Robots:** Next.js native `robots.ts`
- **Metadata:** Global OG/Twitter in root layout, per-page overrides
- **Structured Data:** JSON-LD for Organization + WebApplication + Article
- **Favicon:** Next.js metadata convention (`icon.tsx` or static files)

## Implementation Tasks

### Task 1: GA4 Script
- Add `<Script>` to root layout with `afterInteractive` strategy
- Measurement ID: G-PLZ6ZW54KV

### Task 2: sitemap.ts
- `src/app/sitemap.ts` — static pages + dynamic blog posts
- Include `alternates.languages` for hreflang (tr/en)

### Task 3: robots.ts
- `src/app/robots.ts` — allow public, disallow /app/*, /api/*
- Reference sitemap URL

### Task 4: Global Metadata Enhancement
- Root layout: OG image, site name, twitter card, canonical, alternates
- Marketing page: specific title/description for landing
- Per-page metadata for blog, privacy, terms, kvkk, login

### Task 5: Structured Data (JSON-LD)
- Landing page: Organization + WebApplication
- Blog posts: Article schema

### Task 6: Favicon + Manifest
- favicon.ico, icon.png, apple-touch-icon
- manifest.webmanifest for PWA metadata

### Task 7: Search Console Verification
- Meta tag in root layout OR verification file in public/

## Out of Scope
- Cookie consent banner (future)
- Blog content SEO optimization (separate effort)
- Performance/Core Web Vitals tuning (separate effort)
