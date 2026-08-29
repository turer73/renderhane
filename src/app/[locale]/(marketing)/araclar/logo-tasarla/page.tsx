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
  Hexagon,
  Palette,
  Download,
  Layers,
  PenTool,
  Zap,
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
    icon: PenTool,
    titleTr: "AI Logo Tasarimi",
    titleEn: "AI Logo Design",
    descTr: "Marka adinizi yazin, AI profesyonel logolar uretsin",
    descEn: "Type your brand name, AI creates professional logos",
    color: "text-teal-500",
    bg: "bg-teal-50 dark:bg-teal-500/10",
  },
  {
    icon: Palette,
    titleTr: "Farkli Stiller",
    titleEn: "Multiple Styles",
    descTr: "Minimalist, modern, vintage, 3D ve daha fazlasi",
    descEn: "Minimalist, modern, vintage, 3D and more",
    color: "text-cyan-500",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
  },
  {
    icon: Layers,
    titleTr: "Vektorel Cikti",
    titleEn: "Vector Output",
    descTr: "SVG ve PNG formatinda seffaf arkaplan",
    descEn: "SVG and PNG format with transparent background",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    icon: Hexagon,
    titleTr: "Coklu Varyasyon",
    titleEn: "Multiple Variations",
    descTr: "Tek seferde 4 farkli logo onerisi",
    descEn: "4 different logo suggestions at once",
    color: "text-sky-500",
    bg: "bg-sky-50 dark:bg-sky-500/10",
  },
  {
    icon: Zap,
    titleTr: "30 Saniyede Hazir",
    titleEn: "Ready in 30 Seconds",
    descTr: "Profesyonel tasarimci beklemeden sonuc",
    descEn: "Results without waiting for a professional designer",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    icon: Download,
    titleTr: "Ticari Lisans",
    titleEn: "Commercial License",
    descTr: "Logonuzu tum ticari projelerinizde kullanin",
    descEn: "Use your logo in all commercial projects",
    color: "text-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-500/10",
  },
];

const steps = [
  { num: "1", titleTr: "Marka Bilgisi Girin", titleEn: "Enter Brand Info", descTr: "Marka adi, sektor ve renk tercihinizi belirtin.", descEn: "Specify brand name, industry and color preference." },
  { num: "2", titleTr: "Stil Secin", titleEn: "Choose Style", descTr: "Minimalist, modern, vintage veya 3D stil secin.", descEn: "Select minimalist, modern, vintage or 3D style." },
  { num: "3", titleTr: "Logoyu Indirin", titleEn: "Download Logo", descTr: "Begendiyginiz logoyu SVG/PNG olarak indirin.", descEn: "Download your favorite logo as SVG/PNG." },
];

const useCases = [
  { emoji: "🚀", textTr: "Yeni girisim ve startup logo tasarimi", textEn: "New venture and startup logo design" },
  { emoji: "🛍️", textTr: "E-ticaret magazasi branding", textEn: "E-commerce store branding" },
  { emoji: "🍕", textTr: "Restoran ve kafe logo tasarimi", textEn: "Restaurant and cafe logo design" },
  { emoji: "💼", textTr: "Freelancer ve kisisel marka", textEn: "Freelancer and personal brand" },
  { emoji: "📱", textTr: "Mobil uygulama ikonu", textEn: "Mobile app icon" },
  { emoji: "🎮", textTr: "YouTube ve Twitch kanal logosu", textEn: "YouTube and Twitch channel logo" },
];

/* ── Component ────────────────────────────────────── */

export default function PublicLogoDesignPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-teal-100 to-cyan-100 px-4 py-1.5 text-sm font-medium text-teal-700 dark:from-teal-500/20 dark:to-cyan-500/20 dark:text-teal-300">
          <Hexagon className="size-4" />
          {tr ? "8 Kredi / Logo" : "8 Credits / Logo"}
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          {tr ? "AI ile " : "Design a "}
          <span className="bg-gradient-to-r from-teal-500 via-cyan-500 to-emerald-500 bg-clip-text text-transparent">
            {tr ? "Profesyonel Logo Tasarla" : "Professional Logo with AI"}
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {tr
            ? "Marka adinizi ve sektorunuzu yazin, AI saniyeler icinde profesyonel logo secelekleri uretsin. Minimalist, modern, vintage — istediginiz stilde."
            : "Enter your brand name and industry, AI generates professional logo options in seconds. Minimalist, modern, vintage — in any style you want."}
        </p>
      </section>

      <AdSlot slot="tool-hero" format="horizontal" className="mb-8" />

      {/* Features grid (3 col) */}
      <section className="mb-12 grid gap-6 sm:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={i}
            className="group rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:border-teal-200 hover:shadow-lg dark:hover:border-teal-800"
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
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 text-lg font-bold text-white">
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
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-teal-200 hover:shadow-sm dark:hover:border-teal-800"
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
        <Sparkles className="mx-auto mb-3 size-8 text-teal-500" />
        <h2 className="text-xl font-bold">
          {tr ? "Logo Basi 8 Kredi" : "8 Credits per Logo"}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {tr
            ? "Kayit oldugunuzda 50 ucretsiz kredi ile baslayin. 6 farkli logo olusturun, en iyisini secin!"
            : "Start with 50 free credits when you sign up. Create 6 different logos and pick the best!"}
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
              ? "Logo tasarimi, 3D model, video, gorsel uretimi, sosyal medya paketi ve daha fazlasi. 50 ucretsiz kredi ile baslayin."
              : "Logo design, 3D models, video, image generation, social media kit and more. Start with 50 free credits."}
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
