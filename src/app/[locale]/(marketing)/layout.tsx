/**
 * Marketing layout — wraps all public pages (landing, blog, tools, legal).
 * AdSense script is in the root layout <head> for Google verification.
 * Ad slots (AdSlot component) are only used in free tool pages.
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Preconnect to external origins for faster asset loading */}
      <link rel="preconnect" href="https://byrovuwvzvzipwntounn.supabase.co" />
      <link rel="dns-prefetch" href="https://byrovuwvzvzipwntounn.supabase.co" />
      <link rel="dns-prefetch" href="https://assets.renderhane.com" />
      <link rel="dns-prefetch" href="https://analytics.panola.app" />
      {/* Preload hero 3D model so it starts downloading before JS hydrates */}
      <link
        rel="preload"
        href="/hero/renderhane.glb"
        as="fetch"
        crossOrigin="anonymous"
      />
      {children}
    </>
  );
}
