# Renderhane AdSense and Google Search audit — 2026-08-29

## Evidence boundary

This audit compares the repository, production HTTP/HTML, Google Search Console
and AdSense read-only APIs, and official Google documentation. It does not claim
that ads are serving: the AdSense content client and `renderhane.com` site are
still in `GETTING_READY` review state.

## Verified account and live state

- AdSense account: `READY`, with no pending signup tasks.
- AdSense for Content client: `GETTING_READY`.
- `renderhane.com`: `GETTING_READY`, Auto ads enabled.
- AdSense policy issues returned by API: none.
- Public readiness audit: 64 sitemap URLs before this change, 3/3 trust pages,
  correct root ads.txt, publisher snippet present, and substantive homepage and
  article content (6/6 checks).
- The account has no Renderhane manual ad units. Existing names such as
  `tool-hero` and `video-mid` were not valid numeric AdSense slot IDs.
- Search Console, last 28 days: 84 page-level impressions, 0 clicks.
- Search Console, last 90 days: 229 page-level impressions, 1 click. Most
  visibility came from the Trendyol product-image guide.
- URL Inspection: `/tr`, `/en`, `/tr/blog`, and the background-removal tool were
  submitted and indexed; the QR tool was unknown to Google at audit time.
- Both submitted sitemap records showed zero errors, but their last downloads
  were in April and their recorded 30/50 URL inventories were stale.

## Prioritized findings

### P0 — wrong

- Manual `<ins class="adsbygoogle">` blocks used named design placeholders, while
  AdSense requires numeric ad-unit slot IDs. These blocks could never map to an
  account ad unit and were removed. Auto ads remains the single supported model.
- The AdSense tag was loaded by the locale root layout, including login and
  authenticated application routes. It is now limited to publisher-content
  routes: landing, blog, and public tool pages.

### P1 — missing or should be added

- Google consent defaults now deny analytics/ad storage, ad user data, and ad
  personalization before the AdSense tag is injected. Consent updates remain
  tied to the explicit cookie choice.
- `google-adsense-account` metadata now provides a stable account connection
  signal even though the runtime ad script is content-route scoped.
- `/_next/static/` was removed from robots disallow rules so Google can fetch
  render-critical JavaScript and CSS.
- Login is now `noindex, nofollow` and removed from the sitemap. Authenticated
  application layouts also emit `noindex, nofollow`.
- Every indexable metadata and sitemap locale set now has reciprocal TR/EN links
  and an `x-default` pointing to Turkish.

### P1 — not verifiable through the available API

- The AdSense API exposes review state but not the exact reason for a site that
  remains `GETTING_READY`. The account has no pending tasks or API-visible policy
  issues, so the remaining gate is Google review rather than a proven code error.
- Google-certified CMP / European regulations message activation is only
  verifiable in AdSense **Privacy & messaging** (or with region-specific live
  testing). The custom cookie banner is not evidence of Google CMP certification.
  This must be checked before personalized ads are served in the EEA, UK, or
  Switzerland.
- Auto ads URL exclusions are account-side settings. Direct loads are now scoped
  in code, but `/tr/app/*`, `/en/app/*`, login, auth, onboarding, embed, and legal
  routes should also be confirmed in AdSense URL exclusions.

## Official decision sources

- [AdSense site statuses](https://support.google.com/adsense/answer/12170222)
- [Connect a site to AdSense](https://support.google.com/adsense/answer/7584263)
- [Make ads.txt crawlable](https://support.google.com/adsense/answer/7679060)
- [Google Publisher Policies](https://support.google.com/adsense/answer/10502938)
- [Certified CMP requirement](https://support.google.com/adsense/answer/13554116)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Localized page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [People-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

## Release acceptance criteria

- Lint and TypeScript pass with zero warnings/errors.
- Unit tests cover AdSense identifiers and crawler routes.
- Browser tests prove consent defaults exist before tag injection, AdSense is
  absent from non-content routes, login is noindex, and sitemap/robots are clean.
- Production HTML and Google APIs are rechecked after deployment.
- Search Console sitemap is resubmitted after the new production sitemap is live.
