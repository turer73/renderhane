"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  Clock,
  CheckCircle2,
  Star,
  Box,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/landing-header";
import { EngineToolView } from "@/components/tools/engine-tool-view";

export default function PublicBgRemovePage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";
  const engineLocale = locale === "en" ? "en" : "tr";

  const features = [
    {
      icon: Zap,
      title: tr ? "Saniyeler İçinde" : "In Seconds",
      desc: tr ? "AI ile anında sonuç" : "Instant results with AI",
      color: "text-amber-500",
      bg: "bg-amber-50 dark:bg-amber-500/10",
    },
    {
      icon: Shield,
      title: tr ? "Kayıt Gerektirmez" : "No Signup Required",
      desc: tr ? "Hemen kullanmaya başla" : "Start using immediately",
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      icon: Sparkles,
      title: tr ? "AI Destekli" : "AI-Powered",
      desc: tr ? "Profesyonel kalite" : "Professional quality",
      color: "text-indigo-500",
      bg: "bg-indigo-50 dark:bg-indigo-500/10",
    },
    {
      icon: Clock,
      title: tr ? "Günde 3 Ücretsiz" : "3 Free / Day",
      desc: tr ? "Her gün yenilenir" : "Resets every day",
      color: "text-purple-500",
      bg: "bg-purple-50 dark:bg-purple-500/10",
    },
  ];

  const useCases = [
    { emoji: "🛒", text: tr ? "E-ticaret ürün görselleri" : "E-commerce product photos" },
    { emoji: "📱", text: tr ? "Sosyal medya içerikleri" : "Social media content" },
    { emoji: "🎨", text: tr ? "Grafik tasarım projeleri" : "Graphic design projects" },
    { emoji: "📸", text: tr ? "Pasaport ve vesikalık fotoğraf" : "Passport and ID photos" },
    { emoji: "🖼️", text: tr ? "Portfolyo ve sunum görselleri" : "Portfolio and presentation visuals" },
    { emoji: "🏪", text: tr ? "Pazaryeri listeleme görselleri" : "Marketplace listing images" },
  ];

  return (
    <div className="min-h-screen">
      <LandingHeader />
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <EngineToolView
          locale={engineLocale}
          page="background"
          enableBackgroundApi
          label={tr ? "Arka plan kaldırma çalışma alanı" : "Background removal workspace"}
        />
        {/* Feature Cards */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:mb-12 sm:grid-cols-4 sm:gap-4">
          {features.map((f, i) => (
            <div
              key={i}
              className="group rounded-xl border border-border/60 bg-card p-3 text-center transition-all duration-300 hover:border-indigo-200 hover:shadow-lg dark:hover:border-indigo-800 sm:rounded-2xl sm:p-5"
            >
              <div className={`mx-auto mb-2 flex size-10 items-center justify-center rounded-lg ${f.bg} transition-transform group-hover:scale-110 sm:mb-3 sm:size-12 sm:rounded-xl`}>
                <f.icon className={`size-5 ${f.color} sm:size-6`} />
              </div>
              <h3 className="text-xs font-bold sm:text-sm">{f.title}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Use Cases + Ad Side */}
        <div className="mb-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold">
              {tr ? "Nerede Kullanılır?" : "Where to Use?"}
            </h2>
            <p className="mt-2 text-muted-foreground">
              {tr
                ? "Arka plan kaldırma aracı birçok farklı alanda profesyonel sonuçlar sunar."
                : "Background removal tool delivers professional results across many use cases."}
            </p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {useCases.map((uc, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-indigo-200 hover:shadow-sm dark:hover:border-indigo-800"
                >
                  <span className="text-2xl">{uc.emoji}</span>
                  <span className="text-sm font-medium">{uc.text}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Upsell CTA */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 p-6 text-center text-white shadow-xl shadow-indigo-200/30 dark:shadow-indigo-900/20 sm:rounded-3xl sm:p-12">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <Star className="size-4 text-amber-300" fill="currentColor" />
              {tr ? "Sınırsız Erişim" : "Unlimited Access"}
            </div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">
              {tr ? "12+ AI Aracına Erişim" : "Access 12+ AI Tools"}
            </h2>
            <p className="mt-3 text-white/80">
              {tr
                ? "3D model, ürün sahneleri, video, logo, sosyal medya paketi ve çok daha fazlası. 50 ücretsiz kredi ile başlayın."
                : "3D models, product scenes, video, logo, social media kit and much more. Start with 50 free credits."}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                asChild
                size="lg"
                className="gap-2 bg-white text-indigo-700 font-bold shadow-lg hover:bg-white/90 transition-all"
              >
                <Link href={`/${locale}/login`}>
                  {tr ? "Ücretsiz Kayıt Ol — 50 Kredi Hediye" : "Sign Up Free — 50 Credits Gift"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <div className="flex items-center gap-1.5 text-sm text-white/70">
                <CheckCircle2 className="size-4" />
                {tr ? "Kredi kartı gerekmez" : "No credit card required"}
              </div>
            </div>
          </div>
        </div>

        {/* SEO Content */}
        <div className="mb-12 rounded-2xl border border-border/40 bg-card/80 p-6 sm:p-8">
          <h2 className="text-xl font-bold">
            {tr ? "AI ile Arka Plan Kaldırma Nasıl Çalışır?" : "How Does AI Background Removal Work?"}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {tr
                ? "Renderhane'nin arka plan kaldırma aracı, gelişmiş AI modelleri kullanarak fotoğraftaki ürünü otomatik olarak tespit eder ve arka planı temizler. İşlem saniyeler sürer ve profesyonel kalitede sonuç verir."
                : "Renderhane's background removal tool uses advanced AI models to automatically detect the product in your photo and remove the background. The process takes seconds and delivers professional-quality results."}
            </p>
            <p>
              {tr
                ? "E-ticaret mağazaları, sosyal medya yöneticileri ve grafik tasarımcılar için idealdir. PNG formatında şeffaf arka planlı görsel indirebilirsiniz."
                : "Ideal for e-commerce stores, social media managers, and graphic designers. You can download images with transparent backgrounds in PNG format."}
            </p>
          </div>
        </div>
      </div>
      {/* Footer */}
      <footer className="border-t bg-muted/30 py-8">
        <div className="mx-auto max-w-5xl px-4 text-center">
          <Link
            href={`/${locale}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Box className="size-4" />
            Renderhane
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            {tr
              ? "AI destekli görsel üretim platformu — E-ticaret, Oyun, 3D Baskı"
              : "AI-powered visual production platform — E-commerce, Gaming, 3D Printing"}
          </p>
        </div>
      </footer>
    </div>
  );
}
