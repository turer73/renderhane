"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AdSlot } from "@/components/ads/ad-slot";
import {
  ArrowRight,
  Star,
  CheckCircle2,
  Box,
  Sparkles,
  LayoutGrid,
  Award,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

/* ── Data ─────────────────────────────────────── */

interface Feature {
  icon: LucideIcon;
  titleTr: string;
  titleEn: string;
  descTr: string;
  descEn: string;
  color: string;
  bg: string;
}

const features: Feature[] = [
  {
    icon: LayoutGrid,
    titleTr: "4 Farkli Sahne",
    titleEn: "4 Different Scenes",
    descTr: "Tek seferde 4 profesyonel gorsel",
    descEn: "4 professional visuals at once",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    icon: Award,
    titleTr: "A+ Standartlari",
    titleEn: "A+ Standards",
    descTr: "Amazon, Trendyol, Hepsiburada uyumlu",
    descEn: "Amazon, marketplace compatible",
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-500/10",
  },
  {
    icon: TrendingUp,
    titleTr: "Satis Artisi",
    titleEn: "Boost Sales",
    descTr: "A+ icerikle %15-25 daha fazla satis",
    descEn: "15-25% more sales with A+ content",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
];

const steps = [
  {
    num: "1",
    titleTr: "Urun Gorseli Yukle",
    titleEn: "Upload Product Image",
    descTr: "Tek bir urun fotografi yeterli",
    descEn: "A single product photo is enough",
  },
  {
    num: "2",
    titleTr: "Sahne Stilini Sec",
    titleEn: "Choose Scene Style",
    descTr: "Yasam tarzi, studyo, minimal veya luks",
    descEn: "Lifestyle, studio, minimal or luxury",
  },
  {
    num: "3",
    titleTr: "4 Gorseli Indir",
    titleEn: "Download 4 Images",
    descTr: "Hepsi A+ icin optimize edilmis",
    descEn: "All optimized for A+ content",
  },
];

const useCases = [
  { emoji: "🛒", textTr: "Amazon ve pazaryeri A+ icerik", textEn: "Amazon & marketplace A+ content" },
  { emoji: "🏪", textTr: "Trendyol ve Hepsiburada magaza sayfalari", textEn: "Trendyol & marketplace store pages" },
  { emoji: "📦", textTr: "Urun detay sayfasi gorselleri", textEn: "Product detail page visuals" },
  { emoji: "📱", textTr: "Sosyal medya urun tanitimi", textEn: "Social media product showcase" },
  { emoji: "🎯", textTr: "Reklam ve kampanya gorselleri", textEn: "Ad & campaign visuals" },
  { emoji: "🏷️", textTr: "Marka hikayesi ve sunum sayfasi", textEn: "Brand story & presentation pages" },
];

/* ── Component ────────────────────────────────── */

export default function PublicAplusPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-amber-600 via-orange-600 to-red-600 pb-12 pt-4 text-white sm:pb-14 sm:pt-6">
        <div className="absolute inset-0">
          <div className="absolute left-1/4 top-0 h-[300px] w-[300px] rounded-full bg-white/5 blur-[100px]" />
        </div>

        <div className="relative mx-auto flex max-w-5xl items-center justify-between px-4 pb-4 sm:pb-6">
          <Link
            href={`/${locale}`}
            className="flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white transition-colors"
          >
            <Box className="size-5" />
            Renderhane
          </Link>
          <Link
            href={`/${locale}/login`}
            className="rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold backdrop-blur-sm transition-all hover:bg-white/25"
          >
            {tr ? "Giris Yap" : "Sign In"}
            <ArrowRight className="ml-1.5 inline size-3.5" />
          </Link>
        </div>

        <div className="relative mx-auto max-w-3xl px-4 text-center">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur-sm sm:text-sm">
            <LayoutGrid className="size-3.5" />
            {tr ? "AI Destekli • 32 Kredi" : "AI-Powered • 32 Credits"}
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
            {tr ? "A+ Icerik Paketi " : "A+ Content Pack "}
            <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent">
              {tr ? "4 Sahne, 1 Tik" : "4 Scenes, 1 Click"}
            </span>
          </h1>

          <p className="mx-auto mt-2 max-w-lg text-sm text-white/75 sm:text-base">
            {tr
              ? "Tek bir urun fotografindan 4 farkli sahnede A+ icerik paketi olusturun. Pazaryeri satislarinizi yuksege tasiyin."
              : "Generate an A+ content pack with 4 different scenes from a single product photo. Boost your marketplace sales."}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        {/* Ad Slot — Hero */}
        <AdSlot slot="aplus-hero" format="horizontal" className="mb-8 mt-8" />

        {/* Features */}
        <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={i}
              className="group rounded-2xl border border-border/60 bg-card p-5 text-center transition-all duration-300 hover:border-amber-200 hover:shadow-lg dark:hover:border-amber-800"
            >
              <div
                className={`mx-auto mb-3 flex size-12 items-center justify-center rounded-xl ${f.bg} transition-transform group-hover:scale-110`}
              >
                <f.icon className={`size-6 ${f.color}`} />
              </div>
              <h3 className="text-sm font-bold">{tr ? f.titleTr : f.titleEn}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{tr ? f.descTr : f.descEn}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <section className="mb-12">
          <h2 className="mb-6 text-center text-2xl font-bold">
            {tr ? "Nasil Calisir?" : "How It Works?"}
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((s, i) => (
              <div key={i} className="flex flex-col items-center text-center">
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-sm font-bold text-white">
                  {s.num}
                </div>
                <h3 className="font-semibold">{tr ? s.titleTr : s.titleEn}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{tr ? s.descTr : s.descEn}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Use cases */}
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">
            {tr ? "Kullanim Alanlari" : "Use Cases"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {useCases.map((uc, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-amber-200 hover:shadow-sm dark:hover:border-amber-800"
              >
                <span className="text-2xl">{uc.emoji}</span>
                <span className="text-sm font-medium">{tr ? uc.textTr : uc.textEn}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Ad Slot — Mid */}
        <AdSlot slot="aplus-mid" format="horizontal" className="mb-8" />

        {/* Pricing hint */}
        <section className="mb-12 rounded-2xl bg-muted/50 p-8 text-center">
          <div className="mb-2 inline-flex items-center gap-2">
            <Sparkles className="size-5 text-amber-500" />
            <span className="text-lg font-bold">{tr ? "32 Kredi / Paket (4 Gorsel)" : "32 Credits / Pack (4 Images)"}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {tr
              ? "Kayit oldugunuzda 50 ucretsiz kredi hediye. Ilk paketiniz neredeyse ucretsiz!"
              : "Get 50 free credits when you sign up. Your first pack is nearly free!"}
          </p>
        </section>

        {/* CTA */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 p-6 text-center text-white shadow-xl shadow-indigo-200/30 dark:shadow-indigo-900/20 sm:rounded-3xl sm:p-12">
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
              <Star className="size-4 text-amber-300" fill="currentColor" />
              {tr ? "Sinirsi Erisim" : "Unlimited Access"}
            </div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">
              {tr ? "12+ AI Aracina Erisim" : "Access 12+ AI Tools"}
            </h2>
            <p className="mt-3 text-white/80">
              {tr
                ? "3D model, urun sahneleri, video, logo, sosyal medya paketi ve cok daha fazlasi. 50 ucretsiz kredi ile baslayin."
                : "3D models, product scenes, video, logo, social media kit and much more. Start with 50 free credits."}
            </p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                asChild
                size="lg"
                className="gap-2 bg-white text-indigo-700 font-bold shadow-lg hover:bg-white/90 transition-all"
              >
                <Link href={`/${locale}/login`}>
                  {tr ? "Ucretsiz Kayit Ol — 50 Kredi Hediye" : "Sign Up Free — 50 Credits Gift"}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <div className="flex items-center gap-1.5 text-sm text-white/70">
                <CheckCircle2 className="size-4" />
                {tr ? "Kredi karti gerekmez" : "No credit card required"}
              </div>
            </div>
          </div>
        </div>

        {/* Ad Slot — Bottom */}
        <AdSlot slot="aplus-bottom" format="horizontal" className="mb-12" />

        {/* SEO Content */}
        <div className="mb-12 rounded-2xl border border-border/40 bg-card/80 p-6 sm:p-8">
          <h2 className="text-xl font-bold">
            {tr ? "A+ Icerik Nedir? Neden Onemlidir?" : "What is A+ Content? Why Does It Matter?"}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {tr
                ? "A+ icerik, pazaryerlerinde urun listeleme sayfanizi zenginlestiren gelismis gorsellerdir. Amazon, Trendyol ve Hepsiburada gibi platformlarda donusum oranlarini %15-25 artirdigi kanitlanmistir."
                : "A+ content refers to enhanced visuals that enrich your product listing pages on marketplaces. It has been proven to increase conversion rates by 15-25% on platforms like Amazon, Trendyol and similar marketplaces."}
            </p>
            <p>
              {tr
                ? "Renderhane ile tek bir urun fotografindan 4 farkli sahnede profesyonel A+ gorseller olusturabilirsiniz. Studyo ve fotografci maliyetlerinden tasarruf edin."
                : "With Renderhane, you can create professional A+ visuals in 4 different scenes from a single product photo. Save on studio and photographer costs."}
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
              ? "AI destekli gorsel uretim platformu — E-ticaret, Oyun, 3D Baski"
              : "AI-powered visual production platform — E-commerce, Gaming, 3D Printing"}
          </p>
        </div>
      </footer>
    </div>
  );
}
