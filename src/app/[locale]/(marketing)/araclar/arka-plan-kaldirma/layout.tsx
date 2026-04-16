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
    ? "Ücretsiz Arka Plan Kaldırma — AI ile Otomatik | Renderhane"
    : "Free Background Removal — AI Powered | Renderhane";

  const description = tr
    ? "Fotoğraflardan arka planı saniyeler içinde kaldırın. AI destekli, ücretsiz, kayıt gerektirmez. Günde 3 ücretsiz kullanım hakkı."
    : "Remove backgrounds from photos in seconds. AI-powered, free, no registration required. 3 free uses per day.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/arka-plan-kaldirma`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/arka-plan-kaldirma`,
        en: `${BASE_URL}/en/araclar/arka-plan-kaldirma`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/arka-plan-kaldirma`,
      type: "website",
    },
    keywords: tr
      ? ["arka plan kaldırma", "ücretsiz arka plan silme", "fotoğraf arka plan", "bg remove", "ai arka plan"]
      : ["background removal", "free bg remove", "remove background", "ai background remover", "photo background"],
  };
}

export default async function BgRemoveLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = TOOL_SEO["arka-plan-kaldirma"];
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
