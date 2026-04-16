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
    ? "Konuşan Avatar — AI ile Videolu Ürün Tanıtımı | Renderhane"
    : "Talking Avatar — AI Video Product Presentation | Renderhane";

  const description = tr
    ? "Fotoğraflardan konuşan avatar videoları oluşturun. OmniHuman teknolojisi ile gerçekçi yüz animasyonu. Ürün tanıtım videoları için."
    : "Create talking avatar videos from photos. Realistic face animation with OmniHuman technology. For product presentation videos.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/konusan-avatar`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/konusan-avatar`,
        en: `${BASE_URL}/en/araclar/konusan-avatar`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/konusan-avatar`,
      type: "website",
    },
    keywords: tr
      ? ["konuşan avatar", "AI avatar", "yüz animasyonu", "ürün tanıtım videosu", "OmniHuman"]
      : ["talking avatar", "AI avatar", "face animation", "product video", "OmniHuman"],
  };
}

export default function KonusanAvatarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
