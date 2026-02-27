"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingUp, DollarSign, Clock } from "lucide-react";

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
    <section className="relative overflow-hidden">
      {/* Dark gradient background with teal glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background" />
        <div className="absolute left-1/2 top-0 -z-10 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-[oklch(0.7_0.15_180_/_0.08)] blur-[120px]" />
        <div className="absolute bottom-0 right-0 -z-10 h-[400px] w-[400px] rounded-full bg-[oklch(0.6_0.18_200_/_0.06)] blur-[100px]" />
      </div>

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 -z-10 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="mx-auto max-w-7xl px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-32 lg:px-8 lg:pb-32 lg:pt-40">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge — subtle, small */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary/80">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
            </span>
            <span>{t("badge")}</span>
          </div>

          {/* Title */}
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            {t("hero")}
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {t("heroSub")}
          </p>

          {/* CTA — Teal gradient button */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              size="lg"
              asChild
              className="h-12 px-8 text-base bg-gradient-to-r from-[oklch(0.65_0.15_180)] to-[oklch(0.6_0.16_195)] text-white shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-shadow"
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
              className="group relative rounded-2xl border border-border bg-card/50 p-6 text-center backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
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
