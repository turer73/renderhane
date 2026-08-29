import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { CookieBanner } from "@/components/cookie-banner";
import "@/app/globals.css";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";
const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_ID || "";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.renderhane.com";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const title = `Renderhane — ${t("tagline")}`;
  const description =
    locale === "tr"
      ? "Tek fotoğraftan profesyonel ürün görseli, 3D model ve video üretin. Yapay zeka destekli e-ticaret stüdyosu."
      : "Generate professional product visuals, 3D models and videos from a single photo. AI-powered e-commerce studio.";

  return {
    title,
    description,
    metadataBase: new URL(BASE_URL),
    ...(ADSENSE_ID
      ? { other: { "google-adsense-account": ADSENSE_ID } }
      : {}),
    alternates: {
      canonical: `/${locale}`,
      languages: { tr: "/tr", en: "/en", "x-default": "/tr" },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}`,
      siteName: "Renderhane",
      locale: locale === "tr" ? "tr_TR" : "en_US",
      type: "website",
      images: [
        {
          url: `/opengraph-image`,
          width: 1200,
          height: 630,
          alt: "Renderhane — AI Product Visual Studio",
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/opengraph-image`],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const messages = await getMessages();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Renderhane",
        url: BASE_URL,
        logo: `${BASE_URL}/icon.png`,
        description:
          locale === "tr"
            ? "E-ticaret, oyun ve 3D baskı için AI destekli 3D model ve görsel üretim platformu"
            : "AI-powered 3D model and visual production platform for e-commerce, gaming, and 3D printing",
      },
      {
        "@type": "WebApplication",
        name: "Renderhane",
        url: BASE_URL,
        applicationCategory: "DesignApplication",
        applicationSubCategory: ["3DModeling", "ECommerce", "GameDevelopment"],
        operatingSystem: "Web",
        offers: [
          {
            "@type": "Offer",
            price: "0",
            priceCurrency: "TRY",
            description: locale === "tr" ? "50 ücretsiz kredi ile başla" : "Start with 50 free credits",
          },
          {
            "@type": "Offer",
            price: "199",
            priceCurrency: "TRY",
            description: locale === "tr" ? "Başlangıç — 100 kredi" : "Starter — 100 credits",
          },
          {
            "@type": "Offer",
            price: "499",
            priceCurrency: "TRY",
            description: locale === "tr" ? "Standart — 300 kredi" : "Standard — 300 credits",
          },
          {
            "@type": "Offer",
            price: "999",
            priceCurrency: "TRY",
            description: locale === "tr" ? "Pro — 800 kredi" : "Pro — 800 credits",
          },
        ],
        featureList: locale === "tr"
          ? "3D Model Üretimi, Arka Plan Kaldırma, Sahne Üretimi, Video Oluşturma, PBR Materyal, STL Export, A+ İçerik, Mesh Onarım"
          : "3D Model Generation, Background Removal, Scene Generation, Video Creation, PBR Materials, STL Export, A+ Content, Mesh Repair",
      },
    ],
  };

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {(GA_ID || ADSENSE_ID) && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});",
            }}
          />
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            {children}
            <CookieBanner />
          </NextIntlClientProvider>
        </ThemeProvider>
        <Script
          defer
          data-domain="renderhane.com"
          src="https://analytics.panola.app/js/script.js"
          strategy="afterInteractive"
        />
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="gtag-init" strategy="afterInteractive">
              {`gtag('js',new Date());gtag('config','${GA_ID}');(function(){try{if(localStorage.getItem('cookie-consent')==='all'){gtag('consent','update',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});}}catch(e){}window.addEventListener('cookie-consent',function(e){if(e.detail==='all'){gtag('consent','update',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});}else if(e.detail==='essential'){gtag('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});}});})();`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
