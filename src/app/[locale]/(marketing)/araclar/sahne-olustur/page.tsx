"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowRight,
  Star,
  CheckCircle2,
  Box,
  Sparkles,
  Image as ImageIcon,
  Layers,
  Wand2,
  Camera,
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
    icon: Wand2,
    titleTr: "AI Sahne Yerlesimi",
    titleEn: "AI Scene Placement",
    descTr: "Urun otomatik sahneye yerlesiyor",
    descEn: "Product auto-placed in scene",
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-500/10",
  },
  {
    icon: Layers,
    titleTr: "50+ Sahne Sablonu",
    titleEn: "50+ Scene Templates",
    descTr: "Mutfak, salon, ofis ve daha fazlasi",
    descEn: "Kitchen, living room, office & more",
    color: "text-fuchsia-500",
    bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10",
  },
  {
    icon: Camera,
    titleTr: "Studyo Kalitesi",
    titleEn: "Studio Quality",
    descTr: "Profesyonel isik ve golgelendirme",
    descEn: "Professional lighting & shadows",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
];

const steps = [
  {
    numTr: "1",
    titleTr: "Gorsel Yukle",
    titleEn: "Upload Image",
    descTr: "Urun fotografinizi yukleyin",
    descEn: "Upload your product photo",
  },
  {
    numTr: "2",
    titleTr: "Sahne Sec",
    titleEn: "Choose Scene",
    descTr: "Istediginiz ortami secin veya tarif edin",
    descEn: "Pick or describe the environment you want",
  },
  {
    numTr: "3",
    titleTr: "Sonucu Al",
    titleEn: "Get Result",
    descTr: "AI urunuzu sahneye yerlestirsin",
    descEn: "AI places your product into the scene",
  },
];

const useCases = [
  { emoji: "🛋️", textTr: "Mobilya ve dekorasyon urunleri", textEn: "Furniture & decor products" },
  { emoji: "🍳", textTr: "Mutfak gerecleri ve ev aletleri", textEn: "Kitchenware & home appliances" },
  { emoji: "💄", textTr: "Kozmetik ve kisisel bakim", textEn: "Cosmetics & personal care" },
  { emoji: "📱", textTr: "Elektronik ve aksesuar", textEn: "Electronics & accessories" },
  { emoji: "👟", textTr: "Moda ve giyim urunleri", textEn: "Fashion & apparel" },
  { emoji: "🎁", textTr: "Hediyelik ve promosyon urunleri", textEn: "Gift & promotional items" },
];

/* ── Component ────────────────────────────────── */

export default function PublicScenePage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 pb-12 pt-4 text-white sm:pb-14 sm:pt-6">
        <div className="absolute inset-0">
          <div className="absolute left-1/4 top-0 h-[300px] w-[300px] rounded-full bg-white/5 blur-[100px]" />
        </div>

        {/* Top bar */}
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
            <ImageIcon className="size-3.5" />
            {tr ? "AI Destekli • 8 Kredi" : "AI-Powered • 8 Credits"}
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
            {tr ? "Urununu Profesyonel " : "Place Products in "}
            <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent">
              {tr ? "Sahnelere Yerlestir" : "Professional Scenes"}
            </span>
          </h1>

          <p className="mx-auto mt-2 max-w-lg text-sm text-white/75 sm:text-base">
            {tr
              ? "Tek bir fotografla urunlerinizi studyo kalitesinde sahnelere yerlestirin. Isik, golge ve yansimalar AI tarafindan olusturulur."
              : "Place your products into studio-quality scenes from a single photo. Lighting, shadows and reflections are AI-generated."}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        {/* Features */}
        <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={i}
              className="group rounded-2xl border border-border/60 bg-card p-5 text-center transition-all duration-300 hover:border-violet-200 hover:shadow-lg dark:hover:border-violet-800"
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
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
                  {s.numTr}
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
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-violet-200 hover:shadow-sm dark:hover:border-violet-800"
              >
                <span className="text-2xl">{uc.emoji}</span>
                <span className="text-sm font-medium">{tr ? uc.textTr : uc.textEn}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing hint */}
        <section className="mb-12 rounded-2xl bg-muted/50 p-8 text-center">
          <div className="mb-2 inline-flex items-center gap-2">
            <Sparkles className="size-5 text-violet-500" />
            <span className="text-lg font-bold">{tr ? "8 Kredi / Gorsel" : "8 Credits / Image"}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {tr
              ? "Kayit oldugunuzda 50 ucretsiz kredi hediye. Kredi karti gerekmez."
              : "Get 50 free credits when you sign up. No credit card required."}
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

        {/* SEO Content */}
        <div className="mb-12 rounded-2xl border border-border/40 bg-card/80 p-6 sm:p-8">
          <h2 className="text-xl font-bold">
            {tr ? "AI ile Urun Sahne Olusturma Nedir?" : "What is AI Product Scene Generation?"}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {tr
                ? "Renderhane'nin sahne olusturma araci, urun fotografinizi alir ve AI ile profesyonel ortamlara yerlestir. Mutfak tezgahi, ofis masasi, salon ortami gibi onlarca hazir sahne arasinda secim yapabilir veya kendi sahnenizi tarif edebilirsiniz."
                : "Renderhane's scene generator takes your product photo and places it into professional environments using AI. Choose from dozens of ready-made scenes like kitchen counters, office desks, living rooms, or describe your own custom scene."}
            </p>
            <p>
              {tr
                ? "E-ticaret magazalari, pazaryeri saticilar ve marka yoneticileri icin ideal. Studyo kirasi ve fotografci maliyeti olmadan profesyonel urun gorselleri olusturun."
                : "Ideal for e-commerce stores, marketplace sellers and brand managers. Create professional product visuals without studio rental or photographer costs."}
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
