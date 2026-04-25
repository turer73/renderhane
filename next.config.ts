import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["three"],
  /**
   * Permanent redirects for legacy / orphaned Turkish URLs.
   *
   * GSC "Yeniden yonlendirme hatasi" was triggered because next-intl
   * middleware prepends "/tr" to bare paths like /giris, producing
   * /tr/giris which 404s (we use /tr/login as the canonical route).
   *
   * Confirmed broken chains (curl probe with Googlebot UA):
   *   /giris, /kayit, /sifremi-unuttum
   *   /cerez-politikasi, /gizlilik-politikasi, /kullanim-kosullari
   *
   * No internal source references found — these are external/historical
   * crawl artifacts. We resolve them with 308 (permanent) so Google
   * de-indexes the bad URL and consolidates link equity to the canonical.
   *
   * Note: redirects() runs BEFORE next-intl middleware, so the legacy
   * paths never reach the locale prefixer.
   */
  async redirects() {
    return [
      // Auth — single /login entry point handles both signin and signup
      { source: "/giris", destination: "/tr/login", permanent: true },
      { source: "/giris/:path*", destination: "/tr/login", permanent: true },
      { source: "/tr/giris", destination: "/tr/login", permanent: true },
      { source: "/en/giris", destination: "/en/login", permanent: true },
      { source: "/kayit", destination: "/tr/login", permanent: true },
      { source: "/tr/kayit", destination: "/tr/login", permanent: true },
      { source: "/en/kayit", destination: "/en/login", permanent: true },
      { source: "/sifremi-unuttum", destination: "/tr/login", permanent: true },
      { source: "/tr/sifremi-unuttum", destination: "/tr/login", permanent: true },
      // Legal — Turkish legacy slugs → English canonical
      { source: "/cerez-politikasi", destination: "/tr/cookie-policy", permanent: true },
      { source: "/tr/cerez-politikasi", destination: "/tr/cookie-policy", permanent: true },
      { source: "/en/cerez-politikasi", destination: "/en/cookie-policy", permanent: true },
      { source: "/gizlilik-politikasi", destination: "/tr/privacy", permanent: true },
      { source: "/tr/gizlilik-politikasi", destination: "/tr/privacy", permanent: true },
      { source: "/en/gizlilik-politikasi", destination: "/en/privacy", permanent: true },
      { source: "/kullanim-kosullari", destination: "/tr/terms", permanent: true },
      { source: "/tr/kullanim-kosullari", destination: "/tr/terms", permanent: true },
      { source: "/en/kullanim-kosullari", destination: "/en/terms", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "**.fal.media",
      },
      {
        protocol: "https" as const,
        hostname: "fal.media",
      },
      {
        protocol: "https" as const,
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "https" as const,
        hostname: "*.r2.dev",
      },
      {
        protocol: "https" as const,
        hostname: "assets.renderhane.com",
      },
      {
        protocol: "https" as const,
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
