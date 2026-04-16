import type { Metadata } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.renderhane.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tr = locale === "tr";

  const title = tr
    ? "Görsel İyileştir — AI ile Fotoğraf Kalitesini Artır | Renderhane"
    : "Enhance Image — AI-Powered Photo Upscaling | Renderhane";

  const description = tr
    ? "Düşük çözünürlüklü fotoğraflarınızı AI ile yüksek kaliteye dönüştürün. Aura SR teknolojisi ile 4x büyütme. Detay ve netlik artışı."
    : "Transform low-resolution photos to high quality with AI. 4x upscaling with Aura SR technology. Improved detail and sharpness.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/gorsel-iyilestir`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/gorsel-iyilestir`,
        en: `${BASE_URL}/en/araclar/gorsel-iyilestir`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/gorsel-iyilestir`,
      type: "website",
    },
    keywords: tr
      ? ["görsel iyileştirme", "fotoğraf büyütme", "AI upscaling", "çözünürlük artırma", "fotoğraf kalitesi"]
      : ["image enhancement", "photo upscaling", "AI upscaler", "increase resolution", "photo quality"],
  };
}

export default function GorselIyilestirLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
