"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { AdSlot } from "@/components/ads/ad-slot";
import {
  ArrowRight,
  Star,
  CheckCircle2,
  Share2,
  Sparkles,
  LayoutGrid,
  Image as ImageIcon,
  Zap,
  Ratio,
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
    icon: LayoutGrid,
    titleTr: "Tek Tikla 6 Format",
    titleEn: "6 Formats in One Click",
    descTr: "Instagram, Facebook, Twitter, LinkedIn, Pinterest, YouTube",
    descEn: "Instagram, Facebook, Twitter, LinkedIn, Pinterest, YouTube",
    color: "text-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-500/10",
  },
  {
    icon: Ratio,
    titleTr: "Otomatik Boyutlandirma",
    titleEn: "Auto Resizing",
    descTr: "Her platform icin dogru boyut ve oran",
    descEn: "Correct size and ratio for each platform",
    color: "text-fuchsia-500",
    bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10",
  },
  {
    icon: Sparkles,
    titleTr: "AI Metin Onerisi",
    titleEn: "AI Text Suggestions",
    descTr: "Platform bazli caption ve hashtag onerisi",
    descEn: "Platform-specific caption and hashtag suggestions",
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-500/10",
  },
  {
    icon: ImageIcon,
    titleTr: "Marka Tutarliligi",
    titleEn: "Brand Consistency",
    descTr: "Logo, renk ve font otomatik uygulanir",
    descEn: "Logo, color and font applied automatically",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    icon: Zap,
    titleTr: "Hizli Uretim",
    titleEn: "Fast Generation",
    descTr: "30 saniyede tum paket hazir",
    descEn: "Full pack ready in 30 seconds",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    icon: Share2,
    titleTr: "Toplu Indirme",
    titleEn: "Bulk Download",
    descTr: "Tum gorselleri tek ZIP ile indir",
    descEn: "Download all images in a single ZIP",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
];

const steps = [
  { num: "1", titleTr: "Urun Gorselini Yukle", titleEn: "Upload Product Image", descTr: "Urun veya marka gorselinizi yukleyin.", descEn: "Upload your product or brand image." },
  { num: "2", titleTr: "Platformlari Sec", titleEn: "Select Platforms", descTr: "Instagram, Facebook, Twitter vb. secin.", descEn: "Choose Instagram, Facebook, Twitter etc." },
  { num: "3", titleTr: "Paketi Indir", titleEn: "Download Pack", descTr: "Tum gorselleri ZIP olarak indirin.", descEn: "Download all images as ZIP." },
];

const useCases = [
  { emoji: "🛍️", textTr: "E-ticaret urun tanitimi", textEn: "E-commerce product promotion" },
  { emoji: "🍕", textTr: "Restoran ve kafe sosyal medya yonetimi", textEn: "Restaurant and cafe social media management" },
  { emoji: "👗", textTr: "Moda markasi icerik uretimi", textEn: "Fashion brand content production" },
  { emoji: "🏠", textTr: "Emlak ilan paylasimi", textEn: "Real estate listing sharing" },
  { emoji: "💼", textTr: "Kurumsal marka iletisimi", textEn: "Corporate brand communication" },
  { emoji: "🎉", textTr: "Etkinlik ve kampanya duyurulari", textEn: "Event and campaign announcements" },
];

/* ── Component ────────────────────────────────────── */

export default function PublicSocialKitPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-100 to-violet-100 px-4 py-1.5 text-sm font-medium text-indigo-700 dark:from-indigo-500/20 dark:to-violet-500/20 dark:text-indigo-300">
          <Share2 className="size-4" />
          {tr ? "40 Kredi / Paket" : "40 Credits / Pack"}
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          {tr ? "Tek Tikla " : "One-Click "}
          <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 bg-clip-text text-transparent">
            {tr ? "Sosyal Medya Paketi" : "Social Media Kit"}
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {tr
            ? "Tek bir gorsel yukleyin, 6 farkli platformda kullanima hazir icerik paketi alin. Instagram, Facebook, Twitter, LinkedIn, Pinterest ve YouTube."
            : "Upload a single image and get a content pack ready for 6 different platforms. Instagram, Facebook, Twitter, LinkedIn, Pinterest and YouTube."}
        </p>
      </section>

      <AdSlot slot="tool-hero" format="horizontal" className="mb-8" />

      {/* Features grid (3 col) */}
      <section className="mb-12 grid gap-6 sm:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={i}
            className="group rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:border-indigo-200 hover:shadow-lg dark:hover:border-indigo-800"
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
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-lg font-bold text-white">
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
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-indigo-200 hover:shadow-sm dark:hover:border-indigo-800"
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
        <Sparkles className="mx-auto mb-3 size-8 text-indigo-500" />
        <h2 className="text-xl font-bold">
          {tr ? "Paket Basi 40 Kredi" : "40 Credits per Pack"}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {tr
            ? "Kayit oldugunuzda 50 ucretsiz kredi ile baslayin. Ilk paketinizi hemen olusturun!"
            : "Start with 50 free credits when you sign up. Create your first pack right away!"}
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
              ? "Sosyal medya paketi, 3D model, video, logo, gorsel duzenleme ve daha fazlasi. 50 ucretsiz kredi ile baslayin."
              : "Social media kit, 3D models, video, logo, image editing and more. Start with 50 free credits."}
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
