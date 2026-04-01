import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero";
import { SegmentsSection } from "@/components/landing/segments";
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
  const title =
    locale === "tr"
      ? "Renderhane — AI ile 3D Model, Ürün Görseli ve Video Üretimi"
      : "Renderhane — AI-Powered 3D Models, Product Visuals & Videos";
  const description =
    locale === "tr"
      ? "E-ticaret, oyun geliştirme ve 3D baskı için AI destekli görsel üretim platformu. Tek fotoğraftan profesyonel 3D model, sahne ve video. 50 ücretsiz kredi ile başlayın."
      : "AI-powered visual production for e-commerce, game development, and 3D printing. Professional 3D models, scenes, and videos from a single photo. Start with 50 free credits.";

  return {
    title,
    description,
    keywords:
      locale === "tr"
        ? ["3D model", "ürün fotoğrafı", "AI görsel", "e-ticaret", "oyun asset", "3D baskı", "STL", "PBR", "arka plan silme", "sahne üretimi"]
        : ["3D model", "product photo", "AI visual", "e-commerce", "game asset", "3D printing", "STL", "PBR", "background removal", "scene generation"],
  };
}

export default function MarketingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <SegmentsSection />
        <DemoSectionLazy />
        <FeaturesSection />
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
