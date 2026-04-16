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
    ? "AI ile Video Oluştur — Görselden ve Metinden Video | Renderhane"
    : "AI Video Generator — Image to Video & Text to Video | Renderhane";

  const description = tr
    ? "Ürün fotoğraflarından veya metin açıklamalarından profesyonel videolar oluşturun. Wan 2.6 ve Kling 3.0 Pro modelleri ile."
    : "Create professional videos from product photos or text descriptions. Powered by Wan 2.6 and Kling 3.0 Pro models.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/video-olustur`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/video-olustur`,
        en: `${BASE_URL}/en/araclar/video-olustur`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/video-olustur`,
      type: "website",
    },
    keywords: tr
      ? ["AI video oluşturma", "görselden video", "metinden video", "ürün videosu", "e-ticaret video"]
      : ["AI video generator", "image to video", "text to video", "product video", "ecommerce video"],
  };
}

export default function VideoOlusturLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
