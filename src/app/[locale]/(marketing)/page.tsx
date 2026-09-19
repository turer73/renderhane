import type { Metadata } from "next";
import { LaunchPreview } from "@/components/launch-preview/launch-preview";
import { AdSenseScript } from "@/components/ads/adsense-script";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title =
    locale === "tr"
      ? "Renderhane — AI ile 3D Model, Ürün Görseli ve Video Üretimi"
      : "Renderhane — AI-Powered 3D Models, Product Visuals & Videos";
  const description =
    locale === "tr"
      ? "E-ticaret, oyun geliştirme ve 3D baskı için AI destekli görsel üretim platformu. Tek fotoğraftan profesyonel 3D model, sahne ve video. 50 ücretsiz kredi ile başlayın."
      : "AI-powered visual production for e-commerce, game development, and 3D printing. Professional 3D models, scenes, and videos from a single photo. Start with 50 free credits.";

  return {
    title,
    description,
    keywords:
      locale === "tr"
        ? ["3D model", "ürün fotoğrafı", "AI görsel", "e-ticaret", "oyun asset", "3D baskı", "STL", "PBR", "arka plan silme", "sahne üretimi"]
        : ["3D model", "product photo", "AI visual", "e-commerce", "game asset", "3D printing", "STL", "PBR", "background removal", "scene generation"],
    alternates: {
      canonical: `/${locale}`,
      languages: { tr: "/tr", en: "/en", "x-default": "/tr" },
    },
    openGraph: {
      title,
      description,
      url: `/${locale}`,
      siteName: "Renderhane",
      type: "website",
      locale: locale === "tr" ? "tr_TR" : "en_US",
    },
  };
}

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const previewLocale = locale === "en" ? "en" : "tr";
  return (
    <>
      <AdSenseScript />
      <LaunchPreview locale={previewLocale} production />
    </>
  );
}
