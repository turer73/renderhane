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
  Rotate3d,
  Scan,
  Download,
  Printer,
  Gamepad2,
  ShoppingBag,
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
    icon: Scan,
    titleTr: "Fotograftan 3D",
    titleEn: "Photo to 3D",
    descTr: "Tek fotograf yeterli",
    descEn: "A single photo is enough",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    icon: Rotate3d,
    titleTr: "360° Goruntulenebilir",
    titleEn: "360° Viewable",
    descTr: "Her acidan incelenebilir model",
    descEn: "Model viewable from every angle",
    color: "text-sky-500",
    bg: "bg-sky-50 dark:bg-sky-500/10",
  },
  {
    icon: Download,
    titleTr: "GLB / OBJ Export",
    titleEn: "GLB / OBJ Export",
    descTr: "Populer 3D formatlarda indir",
    descEn: "Download in popular 3D formats",
    color: "text-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-500/10",
  },
];

const steps = [
  {
    num: "1",
    titleTr: "Gorsel Yukle",
    titleEn: "Upload Image",
    descTr: "Urun fotografinizi yukleyin",
    descEn: "Upload your product photo",
  },
  {
    num: "2",
    titleTr: "AI Modelleme",
    titleEn: "AI Modeling",
    descTr: "AI 3D modeli olusturur (1-3 dk)",
    descEn: "AI generates the 3D model (1-3 min)",
  },
  {
    num: "3",
    titleTr: "Indir ve Kullan",
    titleEn: "Download & Use",
    descTr: "GLB/OBJ formatinda indirin",
    descEn: "Download in GLB/OBJ format",
  },
];

const useCases = [
  { emoji: "🛒", textTr: "E-ticaret 3D urun onizleme", textEn: "E-commerce 3D product preview" },
  { emoji: "🎮", textTr: "Oyun ve metaverse asset olusturma", textEn: "Game & metaverse asset creation" },
  { emoji: "🖨️", textTr: "3D baski icin model hazirlama", textEn: "3D printing model preparation" },
  { emoji: "📐", textTr: "Mimari ve ic mekan gorsellestirme", textEn: "Architecture & interior visualization" },
  { emoji: "📱", textTr: "AR (arttirilmis gerceklik) deneyimi", textEn: "AR (augmented reality) experience" },
  { emoji: "🎓", textTr: "Egitim ve sunum materyalleri", textEn: "Education & presentation materials" },
];

/* ── Component ────────────────────────────────── */

export default function Public3DModelPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 pb-12 pt-4 text-white sm:pb-14 sm:pt-6">
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
            <Rotate3d className="size-3.5" />
            {tr ? "AI Destekli • 5-30 Kredi" : "AI-Powered • 5-30 Credits"}
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
            {tr ? "Fotograftan " : "Photo to "}
            <span className="bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 bg-clip-text text-transparent">
              {tr ? "3D Model Olustur" : "3D Model Generation"}
            </span>
          </h1>

          <p className="mx-auto mt-2 max-w-lg text-sm text-white/75 sm:text-base">
            {tr
              ? "Tek bir urun fotografindan AI ile 3D model olusturun. E-ticaret, oyun, 3D baski ve AR projeleri icin kullanin."
              : "Generate 3D models from a single product photo with AI. Use for e-commerce, gaming, 3D printing and AR projects."}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4">
        {/* Ad Slot — Hero */}
        <AdSlot slot="3d-model-hero" format="horizontal" className="mb-8 mt-8" />

        {/* Features */}
        <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={i}
              className="group rounded-2xl border border-border/60 bg-card p-5 text-center transition-all duration-300 hover:border-blue-200 hover:shadow-lg dark:hover:border-blue-800"
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
                <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-sm font-bold text-white">
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
                className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-blue-200 hover:shadow-sm dark:hover:border-blue-800"
              >
                <span className="text-2xl">{uc.emoji}</span>
                <span className="text-sm font-medium">{tr ? uc.textTr : uc.textEn}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Ad Slot — Mid */}
        <AdSlot slot="3d-model-mid" format="horizontal" className="mb-8" />

        {/* Pricing hint */}
        <section className="mb-12 rounded-2xl bg-muted/50 p-8 text-center">
          <div className="mb-2 inline-flex items-center gap-2">
            <Sparkles className="size-5 text-blue-500" />
            <span className="text-lg font-bold">{tr ? "5-30 Kredi / Model" : "5-30 Credits / Model"}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {tr
              ? "Karmasikliga gore kredi degisir. 50 ucretsiz kredi ile baslayabilirsiniz."
              : "Credits vary by complexity. Start with 50 free credits."}
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
        <AdSlot slot="3d-model-bottom" format="horizontal" className="mb-12" />

        {/* SEO Content */}
        <div className="mb-12 rounded-2xl border border-border/40 bg-card/80 p-6 sm:p-8">
          <h2 className="text-xl font-bold">
            {tr ? "AI ile Fotograftan 3D Model Nasil Olusturulur?" : "How to Create 3D Models from Photos with AI?"}
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {tr
                ? "Renderhane'nin 3D model araci, tek bir urun fotografindan AI kullanarak detayli 3D model olusturur. Geleneksel 3D modelleme saatler suren bir is iken, AI ile bu surec dakikalara iner."
                : "Renderhane's 3D model tool creates detailed 3D models from a single product photo using AI. While traditional 3D modeling takes hours, AI reduces this process to minutes."}
            </p>
            <p>
              {tr
                ? "Olusturulan modeller GLB ve OBJ formatinda indirilebilir. E-ticaret siteleri, oyun motorlari, 3D yazicilar ve AR uygulamalarinda kullanilabilir."
                : "Generated models can be downloaded in GLB and OBJ formats. They can be used in e-commerce sites, game engines, 3D printers and AR applications."}
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
