import Script from "next/script";

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID || "";

/**
 * Marketing layout — wraps all public pages (landing, blog, tools, legal).
 * AdSense script is loaded here so it only affects public/free pages,
 * NOT the authenticated dashboard (/app).
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Preload hero 3D model so it starts downloading before JS hydrates */}
      <link
        rel="preload"
        href="/hero/renderhane.glb"
        as="fetch"
        crossOrigin="anonymous"
      />
      {children}
      {ADSENSE_ID && (
        <Script
          async
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      )}
    </>
  );
}
