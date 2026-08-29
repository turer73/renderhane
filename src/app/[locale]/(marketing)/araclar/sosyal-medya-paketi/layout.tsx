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
    ? "Sosyal Medya Paketi — AI ile İçerik Üretimi | Renderhane"
    : "Social Media Kit — AI Content Generation | Renderhane";

  const description = tr
    ? "Ürün fotoğrafınızdan sosyal medya içerikleri oluşturun. 4 sahne görseli ve 1 ürün videosu tek pakette. Instagram, TikTok için ideal."
    : "Generate social media content from your product photo. 4 scene images and 1 product video in one package. Ideal for Instagram, TikTok.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/sosyal-medya-paketi`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/sosyal-medya-paketi`,
        en: `${BASE_URL}/en/araclar/sosyal-medya-paketi`,
        "x-default": `${BASE_URL}/tr/araclar/sosyal-medya-paketi`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/sosyal-medya-paketi`,
      type: "website",
    },
    keywords: tr
      ? ["sosyal medya içerik", "sosyal medya paketi", "AI içerik üretimi", "Instagram görseli", "ürün tanıtım"]
      : ["social media content", "social media kit", "AI content creation", "Instagram visuals", "product promotion"],
  };
}

export default async function SosyalMedyaPaketiLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = TOOL_SEO["sosyal-medya-paketi"];
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
