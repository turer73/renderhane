"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Box,
  Eraser,
  Sparkles,
  Image,
  Video,
  FileText,
  Lightbulb,
  ArrowRight,
} from "lucide-react";

const tools = [
  { key: "3dModel" as const, icon: Box, toolKey: "3dModel" as const },
  { key: "bgRemove" as const, icon: Eraser, toolKey: "bgRemove" as const },
  { key: "enhance" as const, icon: Sparkles, toolKey: "enhance" as const },
  { key: "scene" as const, icon: Image, toolKey: "scene" as const },
  { key: "video" as const, icon: Video, toolKey: "video" as const },
  { key: "aplus" as const, icon: FileText, toolKey: "aplus" as const },
];

export function FeaturesSection() {
  const t = useTranslations("landing");

  const params = useParams();
  const locale = params.locale as string;

  return (
    <section id="features" className="scroll-mt-20 border-t border-border/30 bg-background py-12 transition-colors sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("features.title")}
          </h2>
          <p className="mt-2 text-base text-muted-foreground sm:mt-4 sm:text-lg">
            {t("features.subtitle")}
          </p>
        </div>

        {/* Grid */}
        <div className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-3 sm:mt-16 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {tools.map((tool, i) => (
              <div
                key={tool.key}
                className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/90 p-4 backdrop-blur-sm transition-all duration-300 hover:border-indigo-300/60 hover:bg-card hover:shadow-xl hover:shadow-indigo-100/40 dark:border-border/40 dark:bg-card/60 dark:hover:border-indigo-600/40 dark:hover:shadow-indigo-900/30 sm:rounded-2xl sm:p-6 lg:p-8"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Subtle gradient accent on hover */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-500/[0.03] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                {/* Icon + Tip */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex size-10 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50/80 shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md group-hover:shadow-indigo-100/50 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:group-hover:shadow-indigo-900/30 sm:size-14 sm:rounded-xl">
                    <tool.icon className="size-5 text-indigo-600 dark:text-indigo-400 sm:size-7" />
                  </div>

                  {/* Tip popover — works on both touch and mouse */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex size-9 items-center justify-center rounded-full text-amber-500/70 transition-colors hover:bg-amber-500/10 hover:text-amber-500"
                        aria-label="İpucu"
                      >
                        <Lightbulb className="size-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="top"
                      className="max-w-[260px] px-3 py-2.5 text-xs leading-relaxed"
                    >
                      <div className="flex items-start gap-2">
                        <Lightbulb className="mt-0.5 size-3.5 flex-shrink-0 text-amber-500" />
                        <span>{t(`features.${tool.key}.tip`)}</span>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-foreground sm:text-xl">
                  {t(`features.${tool.key}.title`)}
                </h3>

                {/* Description */}
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:mt-2 sm:text-base">
                  {t(`features.${tool.key}.description`)}
                </p>

                {/* Credits badge + CTA */}
                <div className="mt-4 flex items-center justify-between">
                  <Badge
                    variant="secondary"
                    className="bg-indigo-50 text-indigo-700 border-0 text-xs dark:bg-indigo-500/10 dark:text-indigo-300"
                  >
                    {t(`features.${tool.key}.credits`)}
                  </Badge>
                  <Link
                    href={`/${locale}/login`}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 opacity-100 sm:opacity-0 transition-all duration-300 sm:group-hover:opacity-100 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    {t("demo.tryNow")}
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
      </div>
    </section>
  );
}
