"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Box,
  Eraser,
  Sparkles,
  Image,
  Video,
  FileText,
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
        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool, i) => (
            <div
              key={tool.key}
              className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 transition-all duration-300 hover:border-border hover:shadow-lg"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {/* Subtle gradient accent on hover */}
              <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/[0.02] via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

              {/* Icon */}
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/5 text-primary transition-colors duration-300 group-hover:bg-primary/10">
                <tool.icon className="size-6" />
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-foreground">
                {tt(tool.toolKey)}
              </h3>

              {/* Description */}
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`features.${tool.key}.description`)}
              </p>

              {/* Credits badge */}
              <div className="mt-4">
                <Badge variant="secondary" className="text-xs">
                  {t(`features.${tool.key}.credits`)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
