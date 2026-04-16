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
    ? "AI Logo Tasarla — Profesyonel Logo Üretimi | Renderhane"
    : "AI Logo Designer — Professional Logo Generation | Renderhane";

  const description = tr
    ? "AI ile profesyonel logolar tasarlayın. Recraft V4 teknolojisi ile PNG ve SVG formatında. Sektör bazlı, özelleştirilebilir stil ve renkler."
    : "Design professional logos with AI. PNG and SVG formats with Recraft V4 technology. Industry-based, customizable styles and colors.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/logo-tasarla`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/logo-tasarla`,
        en: `${BASE_URL}/en/araclar/logo-tasarla`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/logo-tasarla`,
      type: "website",
    },
    keywords: tr
      ? ["AI logo tasarımı", "logo oluşturucu", "Recraft V4", "SVG logo", "profesyonel logo"]
      : ["AI logo design", "logo generator", "Recraft V4", "SVG logo", "professional logo"],
  };
}

export default function LogoTasarlaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
