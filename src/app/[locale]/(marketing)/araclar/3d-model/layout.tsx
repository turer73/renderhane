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
    ? "Fotoğraftan 3D Model Oluştur — AI ile GLB Üretimi | Renderhane"
    : "Photo to 3D Model — AI-Powered GLB Generation | Renderhane";

  const description = tr
    ? "Tek fotoğraftan veya çoklu fotoğraflardan profesyonel 3D model oluşturun. GLB formatında indirin. E-ticaret, oyun ve 3D baskı için ideal."
    : "Create professional 3D models from single or multi-view photos. Download in GLB format. Ideal for e-commerce, gaming and 3D printing.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/3d-model`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/3d-model`,
        en: `${BASE_URL}/en/araclar/3d-model`,
        "x-default": `${BASE_URL}/tr/araclar/3d-model`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/3d-model`,
      type: "website",
    },
    keywords: tr
      ? ["3d model oluşturma", "fotoğraftan 3d model", "AI 3d model", "GLB model", "e-ticaret 3d"]
      : ["3d model generator", "photo to 3d model", "AI 3d model", "GLB model", "ecommerce 3d"],
  };
}

export default async function ThreeDModelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = TOOL_SEO["3d-model"];
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
