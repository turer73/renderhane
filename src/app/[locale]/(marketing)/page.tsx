import { LandingHeader } from "@/components/landing/landing-header";
import { HeroSection } from "@/components/landing/hero";
import { FeaturesSection } from "@/components/landing/features";
import { PricingSection } from "@/components/landing/pricing";
import { DemoSection } from "@/components/landing/demo";
import { Footer } from "@/components/landing/footer";

export default function MarketingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
        <DemoSection />
      </main>
      <Footer />
    </div>
  );
}
