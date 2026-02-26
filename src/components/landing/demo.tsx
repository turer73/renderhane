"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Upload, Wand2, Download, ArrowRight } from "lucide-react";

export function DemoSection() {
  const t = useTranslations("landing");
  const params = useParams();
  const locale = params.locale as string;

  const steps = [
    { icon: Upload, text: t("demo.step1"), num: "1" },
    { icon: Wand2, text: t("demo.step2"), num: "2" },
    { icon: Download, text: t("demo.step3"), num: "3" },
  ];

  return (
    <section
      id="demo"
      className="scroll-mt-20 bg-muted/30 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("demo.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("demo.subtitle")}
          </p>
        </div>

        {/* Before/After visual mockup */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Before */}
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              <div className="border-b border-border/50 px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("demo.before")}
                </span>
              </div>
              <div className="relative aspect-square">
                {/* Placeholder mockup for "before" image */}
                <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 via-zinc-100 to-zinc-200 dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800">
                  {/* Simulated product silhouette */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Background noise */}
                      <div className="absolute -inset-8 rounded-full bg-gradient-to-br from-amber-100/40 via-orange-50/20 to-rose-100/30 blur-lg dark:from-amber-900/20 dark:via-orange-900/10 dark:to-rose-900/15" />
                      {/* Product-like shape */}
                      <div className="relative h-32 w-24 rounded-lg bg-gradient-to-b from-zinc-400 to-zinc-500 shadow-lg dark:from-zinc-500 dark:to-zinc-600 sm:h-40 sm:w-32">
                        <div className="absolute inset-x-3 top-3 h-8 rounded-sm bg-white/20 sm:inset-x-4 sm:h-10" />
                        <div className="absolute inset-x-3 bottom-3 h-4 rounded-sm bg-white/10 sm:inset-x-4" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* After */}
            <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-lg shadow-primary/5">
              <div className="border-b border-primary/20 bg-primary/[0.03] px-4 py-2.5">
                <span className="text-sm font-medium text-primary">
                  {t("demo.after")}
                </span>
              </div>
              <div className="relative aspect-square">
                {/* Placeholder mockup for "after" - enhanced result */}
                <div className="absolute inset-0 bg-gradient-to-br from-white via-zinc-50 to-white dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      {/* Clean background - no noise */}
                      {/* Product-like shape - enhanced */}
                      <div className="relative h-32 w-24 rounded-lg bg-gradient-to-b from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/25 sm:h-40 sm:w-32">
                        <div className="absolute inset-x-3 top-3 h-8 rounded-sm bg-white/30 sm:inset-x-4 sm:h-10" />
                        <div className="absolute inset-x-3 bottom-3 h-4 rounded-sm bg-white/20 sm:inset-x-4" />
                        {/* Sparkle effects */}
                        <div className="absolute -right-2 -top-2 size-4 animate-pulse rounded-full bg-amber-400/80" />
                        <div className="absolute -bottom-1 -left-1 size-3 animate-pulse rounded-full bg-emerald-400/60" style={{ animationDelay: "500ms" }} />
                      </div>
                      {/* 3D depth shadows */}
                      <div className="absolute -bottom-3 left-1/2 h-4 w-20 -translate-x-1/2 rounded-full bg-black/10 blur-md sm:w-28" />
                    </div>
                  </div>

                  {/* AI processing indicator line */}
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary via-violet-500 to-primary"
                        style={{
                          width: "100%",
                          backgroundSize: "200% 100%",
                          animation: "shimmer 2s ease-in-out infinite",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow between cards on mobile */}
          <div className="my-4 flex justify-center sm:hidden">
            <ArrowRight className="size-6 rotate-90 text-muted-foreground" />
          </div>
        </div>

        {/* Steps */}
        <div className="mx-auto mt-16 grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="flex flex-col items-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <step.icon className="size-5" />
              </div>
              <div className="mb-1 text-sm font-bold text-primary">
                {step.num}
              </div>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <Button size="lg" asChild className="h-12 px-8 text-base">
            <Link href={`/${locale}/login`}>
              {t("demo.tryNow")}
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </div>

    </section>
  );
}
