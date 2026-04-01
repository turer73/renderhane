"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, DollarSign, Clock } from "lucide-react";
import { FreeBgBanner } from "@/components/app/free-bg-banner";
import dynamic from "next/dynamic";

const HeroModel = dynamic(
  () => import("@/components/landing/hero-model").then((m) => m.HeroModel),
  { ssr: false }
);

export function HeroSection() {
  const t = useTranslations("landing");
  const params = useParams();
  const locale = params.locale as string;

  const stats = [
    {
      icon: TrendingUp,
      value: t("stat1"),
      sub: t("stat1Sub"),
    },
    {
      icon: DollarSign,
      value: t("stat2"),
      sub: t("stat2Sub"),
    },
    {
      icon: Clock,
      value: t("stat3"),
      sub: t("stat3Sub"),
    },
  ];

  return (
    <section className="relative overflow-hidden pt-10 pb-12 sm:pt-24 sm:pb-28 lg:pt-32 lg:pb-32">
      {/* Layered background glow — indigo + purple + ambient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-indigo-300/25 via-purple-200/15 to-transparent blur-[120px] dark:from-indigo-600/15 dark:via-purple-800/10 dark:to-transparent" />
        <div className="absolute right-0 top-1/3 h-[300px] w-[300px] rounded-full bg-purple-200/20 blur-[80px] dark:bg-purple-700/10" />
        <div className="absolute left-0 top-1/2 h-[200px] w-[200px] rounded-full bg-indigo-200/20 blur-[60px] dark:bg-indigo-700/10" />
      </div>

      {/* Grid texture overlay */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.03] dark:opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Floating 3D Model */}
          <div className="mb-4">
            <HeroModel />
          </div>

          {/* Title — gradient text for premium feel */}
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 bg-clip-text text-transparent dark:from-white dark:via-indigo-200 dark:to-white">
              {t("hero")}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg lg:text-xl">
            {t("heroSub")}
          </p>

          {/* CTA */}
          <div className="mt-6 flex flex-col items-center gap-4 sm:mt-10 sm:gap-5">
            <Button
              size="lg"
              asChild
              className="group h-14 w-full sm:w-auto px-10 text-base font-semibold bg-indigo-600 text-white shadow-xl shadow-indigo-500/25 hover:bg-indigo-700 hover:shadow-indigo-500/30 hover:shadow-2xl dark:shadow-indigo-900/40 dark:hover:shadow-indigo-800/50 transition-all duration-300 animate-pulse-subtle"
            >
              <Link href={`/${locale}/login`}>
                {t("cta")}
                <ArrowRight className="ml-2 size-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>

            {/* Social proof */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex -space-x-2">
                {[
                  "bg-indigo-500",
                  "bg-purple-500",
                  "bg-emerald-500",
                  "bg-amber-500",
                ].map((color, i) => (
                  <div
                    key={i}
                    className={`flex size-7 items-center justify-center rounded-full border-2 border-background text-[10px] font-bold text-white ${color}`}
                  >
                    {["A", "M", "E", "K"][i]}
                  </div>
                ))}
              </div>
              <span>{t("socialProof")}</span>
            </div>

            {/* Free BG-Remove Banner */}
            <div className="mt-6 w-full max-w-2xl">
              <FreeBgBanner />
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-3 gap-3 sm:mt-20 sm:gap-8">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/80 p-3 text-center backdrop-blur-sm transition-all duration-300 hover:border-indigo-300/60 hover:bg-card hover:shadow-xl hover:shadow-indigo-100/40 dark:border-border/40 dark:bg-card/50 dark:hover:border-indigo-600/40 dark:hover:shadow-indigo-900/30 sm:rounded-2xl sm:p-6"
            >
              {/* Hover gradient */}
              <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-indigo-50/50 via-transparent to-purple-50/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-indigo-500/5 dark:to-purple-500/5" />

              <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 transition-all duration-300 group-hover:scale-110 group-hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:group-hover:bg-indigo-500/15 sm:mb-3 sm:size-10 sm:rounded-xl">
                <stat.icon className="size-4 sm:size-5" />
              </div>
              <p className="text-sm font-bold text-foreground sm:text-lg">
                {stat.value}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground sm:mt-1 sm:text-sm">{stat.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
