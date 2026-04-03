"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AdSlot } from "@/components/ads/ad-slot";
import {
  ArrowRight,
  Star,
  CheckCircle2,
  Sparkles,
  Wand2,
  Image as ImageIcon,
  Palette,
  Layers,
  Shapes,
  Box,
  Zap,
  Shield,
  type LucideIcon,
} from "lucide-react";

/* ── Data ─────────────────────────────────────────── */

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
    titleTr: "Metin ile Gorsel Uretimi",
    titleEn: "Text to Image Generation",
    descTr: "Aciklamanizi yazin, AI gorselinizi uretsin",
    descEn: "Write your description, AI generates your image",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    icon: Palette,
    titleTr: "Farkli Stiller",
    titleEn: "Multiple Styles",
    descTr: "Fotorealistik, anime, dijital sanat, suluboya",
    descEn: "Photorealistic, anime, digital art, watercolor",
    color: "text-teal-500",
    bg: "bg-teal-50 dark:bg-teal-500/10",
  },
  {
    icon: Layers,
    titleTr: "Yuksek Cozunurluk",
    titleEn: "High Resolution",
    descTr: "1024x1024, 1024x1792 ve daha fazla boyut",
    descEn: "1024x1024, 1024x1792 and more sizes",
    color: "text-cyan-500",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
  },
  {
    icon: Shapes,
    titleTr: "Coklu Varyasyon",
    titleEn: "Multiple Variations",
    descTr: "Tek prompt ile 4'e kadar farkli sonuc",
    descEn: "Up to 4 different results per prompt",
    color: "text-lime-500",
    bg: "bg-lime-50 dark:bg-lime-500/10",
  },
  {
    icon: Zap,
    titleTr: "10 Saniyede Hazir",
    titleEn: "Ready in 10 Seconds",
    descTr: "En son AI modelleri ile hizli uretim",
    descEn: "Fast generation with latest AI models",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    icon: Shield,
    titleTr: "Ticari Kullanim",
    titleEn: "Commercial Use",
    descTr: "Uretilen gorseller ticari projelerinizde kullanilabilir",
    descEn: "Generated images can be used in your commercial projects",
    color: "text-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-500/10",
  },
];

const steps = [
  { num: "1", titleTr: "Prompt Yazin", titleEn: "Write a Prompt", descTr: "Olusturmak istediginiz gorseli detayli tarifleyin.", descEn: "Describe the image you want in detail." },
  { num: "2", titleTr: "Stil Secin", titleEn: "Choose Style", descTr: "Fotorealistik, illusztrasyon veya dijital sanat.", descEn: "Photorealistic, illustration or digital art." },
  { num: "3", titleTr: "Gorseli Indirin", titleEn: "Download Image", descTr: "Begendiyginiz gorseli yuksek cozunurlukle indirin.", descEn: "Download the image you like in high resolution." },
];

const useCases = [
  { emoji: "🛒", textTr: "E-ticaret icin urun konsept gorselleri", textEn: "Product concept images for e-commerce" },
  { emoji: "📱", textTr: "Sosyal medya post ve story gorselleri", textEn: "Social media post and story visuals" },
  { emoji: "📰", textTr: "Blog ve makale kapak gorselleri", textEn: "Blog and article cover images" },
  { emoji: "🎮", textTr: "Oyun ve uygulama tasarimi icin asset", textEn: "Assets for game and app design" },
  { emoji: "📊", textTr: "Sunum ve raporlar icin illusztrasyon", textEn: "Illustrations for presentations and reports" },
  { emoji: "🏷️", textTr: "Reklam banner ve kampanya gorselleri", textEn: "Ad banners and campaign visuals" },
];

/* ── Component ────────────────────────────────────── */

export default function PublicTextToImagePage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-100 to-teal-100 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:from-emerald-500/20 dark:to-teal-500/20 dark:text-emerald-300">
          <Sparkles className="size-4" />
          {tr ? "2-4 Kredi / Gorsel" : "2-4 Credits / Image"}
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          {tr ? "Metinden " : "Generate Images "}
          <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
            {tr ? "Gorsel Uret" : "from Text"}
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {tr
            ? "Hayal ettiginiz gorseli yazin, AI saniyeler icinde uretsin. Fotorealistik, illusztrasyon, dijital sanat — istediginiz stilde."
            : "Write the image you imagine, AI generates it in seconds. Photorealistic, illustration, digital art — in any style you want."}
        </p>
      </section>

      <AdSlot slot="tool-hero" format="horizontal" className="mb-8" />

      {/* Features grid (3 col) */}
      <section className="mb-12 grid gap-6 sm:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={i}
            className="group rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:border-emerald-200 hover:shadow-lg dark:hover:border-emerald-800"
          >
            <div className={`mb-3 flex size-12 items-center justify-center rounded-xl ${f.bg} transition-transform group-hover:scale-110`}>
              <f.icon className={`size-6 ${f.color}`} />
            </div>
            <h3 className="font-bold">{tr ? f.titleTr : f.titleEn}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{tr ? f.descTr : f.descEn}</p>
          </div>
        ))}
      </section>

      {/* How it works (3 step) */}
      <section className="mb-12">
        <h2 className="mb-6 text-center text-2xl font-bold">
          {tr ? "Nasil Calisir?" : "How It Works?"}
        </h2>
        <div className="grid gap-6 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={i} className="text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 text-lg font-bold text-white">
                {s.num}
              </div>
              <h3 className="font-bold">{tr ? s.titleTr : s.titleEn}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{tr ? s.descTr : s.descEn}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="mb-12">
        <h2 className="mb-6 text-center text-2xl font-bold">
          {tr ? "Kullanim Alanlari" : "Use Cases"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {useCases.map((uc, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-emerald-200 hover:shadow-sm dark:hover:border-emerald-800"
            >
              <span className="text-2xl">{uc.emoji}</span>
              <span className="text-sm font-medium">{tr ? uc.textTr : uc.textEn}</span>
            </div>
          ))}
        </div>
      </section>

      <AdSlot slot="tool-mid" format="horizontal" className="mb-8" />

      {/* Pricing hint */}
      <section className="mb-12 rounded-2xl border border-border/40 bg-card/80 p-6 text-center sm:p-8">
        <Sparkles className="mx-auto mb-3 size-8 text-emerald-500" />
        <h2 className="text-xl font-bold">
          {tr ? "Gorsel Basi 2-4 Kredi" : "2-4 Credits per Image"}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {tr
            ? "Standart boyut 2, yuksek cozunurluk 4 kredi. Kayit oldugunuzda 50 ucretsiz kredi hediye."
            : "Standard size 2, high resolution 4 credits. 50 free credits when you sign up."}
        </p>
      </section>

      {/* CTA */}
      <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600 p-6 text-center text-white shadow-xl">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
            <Star className="size-4 text-amber-300" fill="currentColor" />
            {tr ? "12+ AI Araci" : "12+ AI Tools"}
          </div>
          <h2 className="text-2xl font-extrabold sm:text-3xl">
            {tr ? "Tum AI Araclarina Eris" : "Access All AI Tools"}
          </h2>
          <p className="mt-3 text-white/80">
            {tr
              ? "Gorsel uretimi, 3D model, video, logo, sosyal medya paketi ve daha fazlasi. 50 ucretsiz kredi ile baslayin."
              : "Image generation, 3D models, video, logo, social media kit and more. Start with 50 free credits."}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button
              asChild
              size="lg"
              className="gap-2 bg-white text-indigo-700 font-bold shadow-lg hover:bg-white/90"
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

      <AdSlot slot="tool-bottom" format="horizontal" />
    </main>
  );
}
