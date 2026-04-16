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
    ? "Ücretsiz QR Kod Oluşturucu — URL, vCard, WiFi, Telefon | Renderhane"
    : "Free QR Code Generator — URL, vCard, WiFi, Phone | Renderhane";

  const description = tr
    ? "Ücretsiz QR kod oluşturun: web adresi, kişi kartı (vCard), WiFi bağlantısı, telefon, e-posta, SMS, konum ve daha fazlası. Kayıt gerektirmez, PNG + SVG indirin."
    : "Generate free QR codes: URL, contact card (vCard), WiFi, phone, email, SMS, location and more. No registration required, download PNG + SVG.";

  return {
    title,
    description,
    alternates: {
      canonical: `${BASE_URL}/${locale}/araclar/qr-kod`,
      languages: {
        tr: `${BASE_URL}/tr/araclar/qr-kod`,
        en: `${BASE_URL}/en/araclar/qr-kod`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${BASE_URL}/${locale}/araclar/qr-kod`,
      type: "website",
    },
    keywords: tr
      ? ["qr kod oluşturucu", "ücretsiz qr kod", "vcard qr", "wifi qr kod", "qr kod indirme"]
      : ["qr code generator", "free qr code", "vcard qr", "wifi qr code", "qr code download"],
  };
}

export default async function QRKodLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const seo = TOOL_SEO["qr-kod"];
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
