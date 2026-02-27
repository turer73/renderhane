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
    <section id="features" className="scroll-mt-20 py-20 sm:py-28">
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
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {/* Subtle gradient accent on hover */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/[0.03] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                {/* Icon + Tip */}
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary/15">
                    <tool.icon className="size-6" />
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
                <h3 className="text-lg font-semibold text-foreground">
                  {tt(tool.toolKey)}
                </h3>

                {/* Description */}
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {t(`features.${tool.key}.description`)}
                </p>

                {/* Credits badge — teal tinted */}
                <div className="mt-4">
                  <Badge
                    variant="secondary"
                    className="bg-primary/10 text-primary border-0 text-xs"
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
