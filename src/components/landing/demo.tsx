"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Upload, Wand2, Download, ArrowRight, ImageIcon, Box } from "lucide-react";

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

        {/* Before/After visual */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* Before — Original photo (bg removed) */}
            <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
              <div className="border-b border-border/50 px-4 py-2.5">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("demo.before")}
                </span>
              </div>
              <div className="relative aspect-square bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-900 dark:to-zinc-800">
                <Image
                  src="/demo/shoe-original.webp"
                  alt="Original product photo"
                  fill
                  className="object-contain p-4"
                  sizes="(max-width: 640px) 100vw, 50vw"
                  onError={(e) => {
                    // Hide broken image, show fallback
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {/* Fallback placeholder if image doesn't exist */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40">
                  <ImageIcon className="size-16 mb-2" />
                  <span className="text-xs">shoe-original.webp</span>
                </div>
              </div>
            </div>

            {/* After — 3D Model result */}
            <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-lg shadow-primary/5">
              <div className="border-b border-primary/20 bg-primary/[0.03] px-4 py-2.5">
                <span className="text-sm font-medium text-primary">
                  {t("demo.after")}
                </span>
              </div>
              <div className="relative aspect-square bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-800">
                <Image
                  src="/demo/shoe-3d.webp"
                  alt="AI generated 3D model"
                  fill
                  className="object-contain p-4"
                  sizes="(max-width: 640px) 100vw, 50vw"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {/* Fallback placeholder if image doesn't exist */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground/40">
                  <Box className="size-16 mb-2" />
                  <span className="text-xs">shoe-3d.webp</span>
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
