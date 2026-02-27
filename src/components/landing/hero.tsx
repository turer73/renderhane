"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, TrendingUp, DollarSign, Clock } from "lucide-react";
import { FreeBgBanner } from "@/components/app/free-bg-banner";

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
    <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28 lg:pt-32 lg:pb-32">
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
          {/* Badge */}
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-indigo-50/80 px-4 py-2 text-xs font-semibold text-indigo-700 shadow-sm backdrop-blur-sm dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 sm:text-sm">
            <Sparkles className="size-4" />
            <span>{t("badge")}</span>
          </div>

          {/* Title — gradient text for premium feel */}
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-r from-slate-900 via-indigo-900 to-slate-900 bg-clip-text text-transparent dark:from-white dark:via-indigo-200 dark:to-white">
              {t("hero")}
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-xl">
            {t("heroSub")}
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-5">
            <Button
              size="lg"
              asChild
              className="group h-14 px-10 text-base font-semibold bg-indigo-600 text-white shadow-xl shadow-indigo-500/25 hover:bg-indigo-700 hover:shadow-indigo-500/30 hover:shadow-2xl dark:shadow-indigo-900/40 dark:hover:shadow-indigo-800/50 transition-all duration-300 animate-pulse-subtle"
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
        <div className="mx-auto mt-20 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:border-indigo-300/60 hover:bg-card hover:shadow-xl hover:shadow-indigo-100/40 dark:border-border/40 dark:bg-card/50 dark:hover:border-indigo-600/40 dark:hover:shadow-indigo-900/30"
            >
              {/* Hover gradient */}
              <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-indigo-50/50 via-transparent to-purple-50/30 opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:from-indigo-500/5 dark:to-purple-500/5" />

              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-all duration-300 group-hover:scale-110 group-hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:group-hover:bg-indigo-500/15">
                <stat.icon className="size-5" />
              </div>
              <p className="text-lg font-bold text-foreground">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
