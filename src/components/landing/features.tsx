"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Box,
  Eraser,
  Sparkles,
  Image,
  Video,
  FileText,
  Lightbulb,
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
  const tt = useTranslations("tools");

  return (
    <section id="features" className="scroll-mt-20 border-t border-border/40 bg-background py-20 transition-colors sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("features.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("features.subtitle")}
          </p>
        </div>

        {/* Grid */}
        <TooltipProvider delayDuration={200}>
          <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool, i) => (
              <div
                key={tool.key}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 dark:hover:border-indigo-800 dark:hover:shadow-indigo-900/20 sm:p-8"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Subtle gradient accent on hover */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-500/[0.03] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                {/* Icon + Tip */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex size-14 items-center justify-center rounded-xl border border-border bg-card shadow-sm transition-transform duration-300 group-hover:scale-110">
                    <tool.icon className="size-7 text-indigo-600 dark:text-indigo-400" />
                  </div>

                  {/* Tip tooltip */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-full text-amber-500/70 transition-colors hover:bg-amber-500/10 hover:text-amber-500"
                        aria-label="İpucu"
                      >
                        <Lightbulb className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      className="max-w-[260px] bg-popover text-popover-foreground border border-border shadow-lg px-3 py-2.5 text-xs leading-relaxed"
                    >
                      <div className="flex items-start gap-2">
                        <Lightbulb className="mt-0.5 size-3.5 flex-shrink-0 text-amber-500" />
                        <span>{t(`features.${tool.key}.tip`)}</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Title */}
                <h3 className="text-xl font-bold text-foreground">
                  {tt(tool.toolKey)}
                </h3>

                {/* Description */}
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {t(`features.${tool.key}.description`)}
                </p>

                {/* Credits badge */}
                <div className="mt-4">
                  <Badge
                    variant="secondary"
                    className="bg-indigo-50 text-indigo-700 border-0 text-xs dark:bg-indigo-500/10 dark:text-indigo-300"
                  >
                    {t(`features.${tool.key}.credits`)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      </div>
    </section>
  );
}
