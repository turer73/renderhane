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
  Video,
  Mic,
  User,
  Languages,
  Clapperboard,
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
    icon: User,
    titleTr: "Gercekci AI Avatarlar",
    titleEn: "Realistic AI Avatars",
    descTr: "Duzinelerce farkli avatar secenegi",
    descEn: "Dozens of different avatar options",
    color: "text-purple-500",
    bg: "bg-purple-50 dark:bg-purple-500/10",
  },
  {
    icon: Mic,
    titleTr: "Dogal Ses Sentezi",
    titleEn: "Natural Voice Synthesis",
    descTr: "Metninizi dogal sese donusturur",
    descEn: "Converts your text to natural speech",
    color: "text-violet-500",
    bg: "bg-violet-50 dark:bg-violet-500/10",
  },
  {
    icon: Languages,
    titleTr: "Coklu Dil Destegi",
    titleEn: "Multi-Language Support",
    descTr: "Turkce, Ingilizce, Almanca ve 20+ dil",
    descEn: "Turkish, English, German and 20+ languages",
    color: "text-fuchsia-500",
    bg: "bg-fuchsia-50 dark:bg-fuchsia-500/10",
  },
  {
    icon: Video,
    titleTr: "HD Video Cikti",
    titleEn: "HD Video Output",
    descTr: "1080p kalitesinde video indirme",
    descEn: "Download videos in 1080p quality",
    color: "text-pink-500",
    bg: "bg-pink-50 dark:bg-pink-500/10",
  },
  {
    icon: Zap,
    titleTr: "Hizli Isleme",
    titleEn: "Fast Processing",
    descTr: "Dakikalar icinde video hazir",
    descEn: "Video ready in minutes",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-500/10",
  },
  {
    icon: Clapperboard,
    titleTr: "Dudak Senkronu",
    titleEn: "Lip Sync",
    descTr: "Avatar dudak hareketleri sesle uyumlu",
    descEn: "Avatar lip movements sync with audio",
    color: "text-rose-500",
    bg: "bg-rose-50 dark:bg-rose-500/10",
  },
];

const steps = [
  { num: "1", titleTr: "Metni Yazin", titleEn: "Write Your Script", descTr: "Avatarin soylemasini istediginiz metni girin.", descEn: "Enter the text you want the avatar to say." },
  { num: "2", titleTr: "Avatar ve Ses Secin", titleEn: "Choose Avatar & Voice", descTr: "Avatari, dili ve ses tonunu belirleyin.", descEn: "Select the avatar, language and voice tone." },
  { num: "3", titleTr: "Videoyu Indirin", titleEn: "Download Video", descTr: "Hazirlanan videoyu MP4 olarak indirin.", descEn: "Download the generated video as MP4." },
];

const useCases = [
  { emoji: "🎓", textTr: "Online egitim ve kurs videolari", textEn: "Online education and course videos" },
  { emoji: "📢", textTr: "Urun tanitim videolari", textEn: "Product introduction videos" },
  { emoji: "🏢", textTr: "Kurumsal iletisim ve HR videolari", textEn: "Corporate communication and HR videos" },
  { emoji: "🛒", textTr: "E-ticaret urun aciklamalari", textEn: "E-commerce product descriptions" },
  { emoji: "📱", textTr: "Sosyal medya icin kisa videolar", textEn: "Short videos for social media" },
  { emoji: "🌍", textTr: "Cok dilli pazarlama kampanyalari", textEn: "Multilingual marketing campaigns" },
];

/* ── Component ────────────────────────────────────── */

export default function PublicTalkingAvatarPage() {
  const params = useParams<{ locale: string }>();
  const locale = params.locale || "tr";
  const tr = locale === "tr";

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      {/* Hero */}
      <section className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-100 to-fuchsia-100 px-4 py-1.5 text-sm font-medium text-purple-700 dark:from-purple-500/20 dark:to-fuchsia-500/20 dark:text-purple-300">
          <Video className="size-4" />
          {tr ? "25 Kredi / Video" : "25 Credits / Video"}
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
          {tr ? "AI ile " : "Create "}
          <span className="bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
            {tr ? "Konusan Avatar" : "Talking Avatar"}
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          {tr
            ? "Metninizi yazin, gercekci bir AI avatar saniyeler icinde videoya donustursun. Egitim, tanitim, pazarlama — her alanda kullanin."
            : "Write your script and a realistic AI avatar turns it into a video in seconds. Education, promotion, marketing — use in every field."}
        </p>
      </section>

      <AdSlot slot="tool-hero" format="horizontal" className="mb-8" />

      {/* Features grid (3 col) */}
      <section className="mb-12 grid gap-6 sm:grid-cols-3">
        {features.map((f, i) => (
          <div
            key={i}
            className="group rounded-2xl border border-border/60 bg-card p-5 transition-all duration-300 hover:border-purple-200 hover:shadow-lg dark:hover:border-purple-800"
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
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 text-lg font-bold text-white">
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
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 p-4 transition-all hover:border-purple-200 hover:shadow-sm dark:hover:border-purple-800"
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
        <Sparkles className="mx-auto mb-3 size-8 text-purple-500" />
        <h2 className="text-xl font-bold">
          {tr ? "Video Basi 25 Kredi" : "25 Credits per Video"}
        </h2>
        <p className="mt-2 text-muted-foreground">
          {tr
            ? "Kayit oldugunuzda 50 ucretsiz kredi ile baslayin. Ilk tanitim videonuzu hemen olusturun!"
            : "Start with 50 free credits when you sign up. Create your first promo video right away!"}
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
              ? "Konusan avatar, 3D model, gorsel uretimi, logo, sosyal medya paketi ve daha fazlasi. 50 ucretsiz kredi ile baslayin."
              : "Talking avatar, 3D models, image generation, logo, social media kit and more. Start with 50 free credits."}
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
