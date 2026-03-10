import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero";
import { FeaturesSection } from "@/components/landing/features";
import { PricingSection } from "@/components/landing/pricing";
import { Footer } from "@/components/landing/footer";
import { DemoSectionLazy } from "@/components/landing/demo-lazy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const title =
    locale === "tr"
      ? "Renderhane — E-Ticaret Mağazanız İçin AI Stüdyosu"
      : "Renderhane — AI Studio for Your E-Commerce Store";
  const description =
    locale === "tr"
      ? "Tek fotoğraftan profesyonel ürün görseli, 3D model ve video üretin. 20 ücretsiz kredi ile hemen başlayın."
      : "Generate professional product visuals, 3D models and videos from a single photo. Start free with 20 credits.";

  return {
    title,
    description,
    keywords:
      locale === "tr"
        ? ["ürün fotoğrafı", "AI görsel", "3D model", "arka plan silme", "e-ticaret", "ürün görseli"]
        : ["product photo", "AI visual", "3D model", "background removal", "e-commerce", "product image"],
  };
}

export default function MarketingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <DemoSectionLazy />
        <FeaturesSection />
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
