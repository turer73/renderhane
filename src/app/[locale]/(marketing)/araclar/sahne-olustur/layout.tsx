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
    ? "AI Ürün Sahnesi Oluştur — Profesyonel Ürün Fotoğrafı | Renderhane"
    : "AI Product Scene Generator — Professional Product Photography | Renderhane";

  const description = tr
    ? "Ürün fotoğraflarınız için profesyonel sahneler oluşturun. AI ile arka plan değiştirme ve sahne üretimi. E-ticaret görselleri için ideal."
    : "Generate professional scenes for your product photos. AI-powered background replacement and scene generation. Ideal for e-commerce visuals.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/sahne-olustur`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/sahne-olustur`,
        en: `${BASE_URL}/en/araclar/sahne-olustur`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/sahne-olustur`,
      type: "website",
    },
    keywords: tr
      ? ["ürün sahnesi oluşturma", "AI sahne üretimi", "e-ticaret fotoğrafçılığı", "ürün fotoğrafı", "arka plan değiştirme"]
      : ["product scene generator", "AI scene creation", "ecommerce photography", "product photography", "background replacement"],
  };
}

export default function SahneOlusturLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
