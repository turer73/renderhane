import type { Metadata } from "next";
import { TOOL_SEO } from "@/lib/seo/tool-jsonld";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.renderhane.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tr = locale === "tr";

  const title = tr
    ? "A+ İçerik Oluştur — Amazon & Pazaryeri Görselleri | Renderhane"
    : "A+ Content Generator — Amazon & Marketplace Visuals | Renderhane";

  const description = tr
    ? "Pazaryerleri için A+ içerik görselleri oluşturun. 4 farklı sahne, profesyonel ürün fotoğrafçılığı. Amazon, Trendyol, Hepsiburada için."
    : "Generate A+ content visuals for marketplaces. 4 different scenes, professional product photography. For Amazon, Etsy, Shopify.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/aplus-icerik`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/aplus-icerik`,
        en: `${BASE_URL}/en/araclar/aplus-icerik`,
        "x-default": `${BASE_URL}/tr/araclar/aplus-icerik`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/aplus-icerik`,
      type: "website",
    },
    keywords: tr
      ? ["A+ içerik", "amazon görselleri", "pazaryeri ürün fotoğrafı", "e-ticaret içerik", "ürün sahnesi"]
      : ["A+ content", "amazon product images", "marketplace product photos", "ecommerce content", "product scenes"],
  };
}

export default async function AplusIcerikLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = TOOL_SEO["aplus-icerik"];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(seo.jsonLd(locale)) }}
      />
      {children}
    </>
  );
}
