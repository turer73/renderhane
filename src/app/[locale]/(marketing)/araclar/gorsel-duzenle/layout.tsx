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
    ? "AI ile Görsel Düzenle — FLUX Kontext Editör | Renderhane"
    : "AI Image Editor — FLUX Kontext Editor | Renderhane";

  const description = tr
    ? "Fotoğraflarınızı AI ile düzenleyin. Renk değiştirme, arka plan değiştirme, stil uygulama, boyut değiştirme. FLUX Kontext teknolojisi."
    : "Edit your photos with AI. Color change, background swap, style transfer, resize. Powered by FLUX Kontext technology.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/gorsel-duzenle`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/gorsel-duzenle`,
        en: `${BASE_URL}/en/araclar/gorsel-duzenle`,
        "x-default": `${BASE_URL}/tr/araclar/gorsel-duzenle`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/gorsel-duzenle`,
      type: "website",
    },
    keywords: tr
      ? ["AI görsel düzenleme", "fotoğraf editörü", "FLUX Kontext", "görsel düzenleyici", "AI editör"]
      : ["AI image editor", "photo editor", "FLUX Kontext", "image editing", "AI editor"],
  };
}

export default async function GorselDuzenleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = TOOL_SEO["gorsel-duzenle"];
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
