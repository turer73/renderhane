"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, TrendingUp, DollarSign, Clock } from "lucide-react";

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
      {/* Background glow — indigo/purple */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-b from-indigo-300/30 to-purple-100/20 blur-[100px] dark:from-indigo-600/20 dark:to-purple-900/10" />
      </div>

      {/* Subtle texture overlay */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.03] dark:opacity-[0.01]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300 sm:text-sm">
            <Sparkles className="size-4" />
            <span>{t("badge")}</span>
          </div>

          {/* Title with gradient text */}
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t("hero")}
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg lg:text-xl">
            {t("heroSub")}
          </p>

          {/* CTA — indigo button */}
          <div className="mt-8 flex flex-col items-center gap-4 sm:mt-10 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              asChild
              className="h-12 px-8 text-base bg-indigo-600 text-white shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:shadow-indigo-300/50 dark:shadow-indigo-900/30 dark:hover:shadow-indigo-800/40 transition-all"
            >
              <Link href={`/${locale}/login`}>
                {t("cta")}
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mx-auto mt-20 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-8">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="group relative rounded-2xl border border-border bg-card/50 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/50 dark:hover:border-indigo-800 dark:hover:shadow-indigo-900/20"
            >
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <stat.icon className="size-5" />
              </div>
              <p className="text-lg font-semibold text-foreground">
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
