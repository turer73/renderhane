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
    ? "Ücretsiz NFC Etiket Programlama — Telefondan Yazın | Renderhane"
    : "Free NFC Tag Writer — Program Tags From Your Phone | Renderhane";

  const description = tr
    ? "NFC etiket ve kartlarınızı telefonunuzun tarayıcısından programlayın: web adresi, dijital kartvizit (vCard), WiFi, konum, uygulama. Uygulama kurmadan, kayıt gerektirmeden, sınırsız."
    : "Program NFC tags and cards straight from your phone browser: URL, digital business card (vCard), Wi-Fi, location, app. No app install, no registration, unlimited.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/nfc-yaz`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/nfc-yaz`,
        en: `${BASE_URL}/en/araclar/nfc-yaz`,
        "x-default": `${BASE_URL}/tr/araclar/nfc-yaz`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/nfc-yaz`,
      type: "website",
    },
    keywords: tr
      ? [
          "nfc etiket programlama",
          "nfc yazma",
          "ücretsiz nfc",
          "nfc kartvizit",
          "nfc wifi etiketi",
          "ntag213 yazma",
        ]
      : [
          "nfc tag writer",
          "program nfc tag",
          "free nfc writer",
          "nfc business card",
          "nfc wifi tag",
          "write ntag213",
        ],
  };
}

export default async function NfcYazLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = TOOL_SEO["nfc-yaz"];
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
