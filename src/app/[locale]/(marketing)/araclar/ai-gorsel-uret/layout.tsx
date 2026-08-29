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
    ? "AI Görsel Üret — Metinden Fotoğraf Oluştur | Renderhane"
    : "AI Image Generator — Text to Image | Renderhane";

  const description = tr
    ? "Metin açıklamalarından yüksek kaliteli görseller oluşturun. FLUX 2 Pro, FLUX Schnell modelleri ile. Ürün konsepti ve pazarlama görselleri için."
    : "Generate high-quality images from text descriptions. Powered by FLUX 2 Pro and FLUX Schnell models. For product concepts and marketing visuals.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/ai-gorsel-uret`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/ai-gorsel-uret`,
        en: `${BASE_URL}/en/araclar/ai-gorsel-uret`,
        "x-default": `${BASE_URL}/tr/araclar/ai-gorsel-uret`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/ai-gorsel-uret`,
      type: "website",
    },
    keywords: tr
      ? ["AI görsel üretimi", "metinden görsel", "text to image", "FLUX görsel", "AI fotoğraf"]
      : ["AI image generator", "text to image", "AI photo", "FLUX image", "AI art"],
  };
}

export default async function AiGorselUretLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = TOOL_SEO["ai-gorsel-uret"];
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
