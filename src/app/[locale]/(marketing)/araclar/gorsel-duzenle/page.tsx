"use client";

import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  ArrowRight,
  Star,
  CheckCircle2,
  Paintbrush,
  Wand2,
  Layers,
  Sparkles,
  Scissors,
  Palette,
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
    titleTr: "AI ile Otomatik Düzenleme",
    titleEn: "AI Auto Editing",
    descTr: "Tek tıkla renk, ışık ve kontrast düzeltme",
    descEn: "One-click color, light & contrast correction",
    color: "text-orange-500",
    bg: "bg-orange-50 dark:bg-orange-500/10",
  },
  {
    icon: Scissors,
    titleTr: "Nesne Silme & Ekleme",
    titleEn: "Object Removal & Addition",
    descTr: "İstenmeyen nesneleri kaldır veya yeni ekle",
    descEn: "Remove unwanted objects or add new ones",
    color: "text-rose-500",
    bg: "bg-rose-50 dark:bg-rose-500/10",
  },
  {
    icon: Palette,
    titleTr: "Renk ve Stil Değiştirme",
    titleEn: "Color & Style Transfer",
    descTr: "Görselin tonunu ve stilini değiştir",
    descEn: "Change the tone and style of your image",
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-500/10",
  },
  {
    icon: Layers,
    titleTr: "Yüksek Çözünürlük",
    titleEn: "High Resolution",
    descTr: "4K kalitesinde çıktı al",
    descEn: "Get 4K quality output",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    icon: Zap,
    titleTr: "Saniyeler İçinde",
    titleEn: "In Seconds",
    descTr: "Hızlı AI işleme motoru",
    descEn: "Fast AI processing engine",
    color: "text-cyan-500",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
  },
  {
    icon: Shield,
    titleTr: "Güvenli İşlem",
    titleEn: "Secure Processing",
    descTr: "Görseller işlem sonrası silinir",
    descEn: "Images deleted after processing",
    color: "text-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
];

const steps = [
  { numTr: "1", titleTr: "Görsel Yükle", titleEn: "Upload Image", descTr: "PNG veya JPG formatında görselinizi yükleyin.", descEn: "Upload your image in PNG or JPG format." },
  { numTr: "2", titleTr: "Düzenleme Talimatı Ver", titleEn: "Give Edit Instructions", descTr: "AI'ya ne değiştirmesini istediğinizi yazın.", descEn: "Tell the AI what changes you want." },
  { numTr: "3", titleTr: "Sonucu İndir", titleEn: "Download Result", descTr: "Düzenlenmiş görseli anında indirin.", descEn: "Download your edited image instantly." },
];

const useCases = [
  { emoji: "🛒", textTr: "E-ticaret ürün fotoğraflarını iyileştirme", textEn: "Enhance e-commerce product photos" },
  { emoji: "📸", textTr: "Eski fotoğrafları restore etme", textEn: "Restore old photographs" },
  { emoji: "🎨", textTr: "Grafik tasarım projelerinde hızlı düzenleme", textEn: "Quick edits in graphic design projects" },
  { emoji: "📱", textTr: "Sosyal medya içerik iyileştirme", textEn: "Social media content improvement" },
  { emoji: "🏠", textTr: "Emlak ilanları için görsel düzenleme", textEn: "Image editing for real estate listings" },
  { emoji: "👗", textTr: "Moda ve tekstil görselleri düzenleme", textEn: "Fashion and textile image editing" },
];

/* ── Component ────────────────────────────────────── */

export default function PublicImageEditPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-100 to-amber-100 px-4 py-1.5 text-sm font-medium text-orange-700 dark:from-orange-500/20 dark:to-amber-500/20 dark:text-orange-300">
          <Paintbrush className="size-4" />
          {tr ? "6 Kredi / Görsel" : "6 Credits / Image"}
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          {tr ? "AI ile " : "Edit Images with "}
          <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent">
            {tr ? "Görsel Düzenle" : "AI Power"}
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {tr
            ? "Fotoğraflarınızı AI ile profesyonelce düzenleyin. Nesne silme, renk düzeltme, stil değiştirme — hepsi tek komutla."
            : "Edit your photos professionally with AI. Object removal, color correction, style transfer — all with a single command."}
        </p>
      </section>

      {/* Features grid (3 col) */}
      <section className="mb-12 grid gap-6 sm:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={i}
            className="group rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:border-orange-200 hover:shadow-lg dark:hover:border-orange-800"
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
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-lg font-bold text-white">
                {s.numTr}
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
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-orange-200 hover:shadow-sm dark:hover:border-orange-800"
            >
              <span className="text-2xl">{uc.emoji}</span>
              <span className="text-sm font-medium">{tr ? uc.textTr : uc.textEn}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing hint */}
      <section className="mb-12 rounded-2xl border border-border/40 bg-card/80 p-6 text-center sm:p-8">
        <Sparkles className="mx-auto mb-3 size-8 text-orange-500" />
        <h2 className="text-xl font-bold">
          {tr ? "Gorsel Basi 6 Kredi" : "6 Credits per Image"}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {tr
            ? "Kayit oldugunuzda 50 ucretsiz kredi ile baslayabilirsiniz. Ekstra paketler 10 TL'den baslar."
            : "Start with 50 free credits when you sign up. Extra packs start from $1."}
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
              ? "Gorsel duzenleme, 3D model, video, logo, sosyal medya paketi ve daha fazlasi. 50 ucretsiz kredi ile baslayin."
              : "Image editing, 3D models, video, logo, social media kit and more. Start with 50 free credits."}
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

    </main>
  );
}
