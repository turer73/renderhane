"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star, Calculator } from "lucide-react";
import { TOOL_CREDITS, TOOL_KEYS, type ToolType } from "@/lib/fal/models";

const packages = [
  {
    key: "starter" as const,
    credits: 100,
    priceValue: 199,
    features: ["feature1", "feature2", "feature3"] as const,
    popular: false,
  },
  {
    key: "standard" as const,
    credits: 300,
    priceValue: 499,
    features: ["feature1", "feature2", "feature3"] as const,
    popular: true,
  },
  {
    key: "pro" as const,
    credits: 800,
    priceValue: 999,
    features: ["feature1", "feature2", "feature3", "feature4"] as const,
    popular: false,
  },
  {
    key: "enterprise" as const,
    credits: 0,
    priceValue: 0,
    features: ["feature1", "feature2", "feature3", "feature4"] as const,
    popular: false,
  },
];

export function PricingSection() {
  const t = useTranslations("landing");
  const params = useParams();
  const locale = params.locale as string;

  return (
    <section id="pricing" className="relative scroll-mt-20 bg-gradient-to-b from-muted/40 to-background py-20 transition-colors sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("pricing.title")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("pricing.subtitle")}
          </p>
        </div>

        {/* Coming Soon Banner */}
        <div className="mx-auto mt-10 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-white" />
            </span>
            {t("pricing.comingSoon")}
          </div>
        </div>

        {/* Cards — dimmed until payment goes live */}
        <div className="mx-auto mt-10 grid grid-cols-1 gap-4 opacity-60 pointer-events-none select-none sm:max-w-5xl sm:grid-cols-2 lg:grid-cols-4">
          {packages.map((pkg) => {
            const isPopular = pkg.popular;
            const isEnterprise = pkg.key === "enterprise";
            const perCredit =
              pkg.priceValue > 0
                ? t("pricing.perCreditFormat", {
                    amount: (pkg.priceValue / pkg.credits).toFixed(2),
                  })
                : null;

            return (
              <div
                key={pkg.key}
                className={`relative flex flex-col rounded-3xl p-6 transition-all duration-300 ${
                  isPopular
                    ? "overflow-visible bg-gradient-to-b from-indigo-800 to-indigo-950 text-white shadow-2xl shadow-indigo-900/30 z-10 md:scale-105 ring-1 ring-indigo-500/30"
                    : "overflow-hidden border border-border/60 bg-card text-foreground shadow-sm hover:border-indigo-300/60 hover:shadow-lg hover:shadow-indigo-100/30 dark:border-border/40 dark:hover:border-indigo-600/40 dark:hover:shadow-indigo-900/20"
                }`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                    <Badge className="bg-gradient-to-r from-indigo-400 to-purple-400 text-white border-0 px-4 py-1 text-xs font-bold uppercase tracking-wide whitespace-nowrap shadow-lg shadow-indigo-500/30">
                      {t("pricing.mostPopular")}
                    </Badge>
                  </div>
                )}

                {/* Popular glow */}
                {isPopular && (
                  <div className="absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-indigo-400/20 blur-[60px]" />
                )}

                {/* Package name */}
                <h3 className={`text-lg font-semibold ${isPopular ? "text-indigo-200 mt-2" : "text-muted-foreground"}`}>
                  {t(`pricing.${pkg.key}.name`)}
                </h3>

                {/* Price */}
                <div className="mt-2">
                  <span className={`text-3xl font-extrabold ${isPopular ? "text-white" : "text-foreground"} md:text-4xl`}>
                    {t(`pricing.${pkg.key}.price`)}
                  </span>
                  {!isEnterprise && (
                    <span className={`ml-2 text-xs ${isPopular ? "text-indigo-300" : "text-muted-foreground"}`}>
                      {t("pricing.vatIncluded")}
                    </span>
                  )}
                </div>

                {/* Credits + Per-credit */}
                <div className={`mt-4 border-y py-4 ${isPopular ? "border-indigo-700/60" : "border-border/60"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Star className={`size-5 ${isPopular ? "text-yellow-400" : "text-indigo-600 dark:text-indigo-400"}`} fill="currentColor" />
                    <span className="text-xl font-bold">
                      {t(`pricing.${pkg.key}.credits`)}
                    </span>
                  </div>
                  {perCredit && (
                    <p className={`text-sm ${isPopular ? "text-indigo-300" : "text-muted-foreground"}`}>
                      {perCredit}
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="mt-6 flex-1 space-y-3">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm"
                    >
                      <Check className={`mt-0.5 size-5 shrink-0 ${isPopular ? "text-indigo-400" : "text-indigo-600 dark:text-indigo-500"}`} />
                      <span className={isPopular ? "text-indigo-100" : "text-muted-foreground"}>
                        {t(`pricing.${pkg.key}.${feature}`)}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="mt-6">
                  {isEnterprise ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      asChild
                    >
                      <Link href={`/${locale}/login`}>
                        {t("pricing.contactUs")}
                      </Link>
                    </Button>
                  ) : isPopular ? (
                    <Button
                      asChild
                      className="w-full bg-white text-indigo-900 shadow-lg shadow-indigo-900/20 hover:bg-slate-100 font-semibold transition-all"
                    >
                      <Link href={`/${locale}/login`}>
                        {t("pricing.buyNow")}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full hover:border-indigo-300 hover:text-indigo-700 dark:hover:border-indigo-600 dark:hover:text-indigo-300 transition-colors"
                      asChild
                    >
                      <Link href={`/${locale}/login`}>
                        {t("pricing.buyNow")}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Credit Calculator — dimmed until payment goes live */}
        <div className="opacity-60 pointer-events-none select-none">
          <CreditCalculator />
        </div>
      </div>
    </section>
  );
}

/* ── Credit Calculator ── */

const CALC_TOOLS: { tool: ToolType; icon: string }[] = [
  { tool: "bg-remove", icon: "🧹" },
  { tool: "enhance", icon: "✨" },
  { tool: "scene", icon: "🎬" },
  { tool: "3d-model", icon: "📦" },
  { tool: "video", icon: "🎥" },
  { tool: "aplus", icon: "⭐" },
];

function CreditCalculator() {
  const t = useTranslations("landing");
  const tTools = useTranslations("tools");
  const tCredits = useTranslations("credits");

  const [counts, setCounts] = useState<Record<ToolType, number>>(
    Object.fromEntries(CALC_TOOLS.map(({ tool }) => [tool, 0])) as Record<
      ToolType,
      number
    >
  );

  const totalCredits = Object.entries(counts).reduce(
    (sum, [tool, count]) => sum + count * TOOL_CREDITS[tool as ToolType],
    0
  );

  // Find recommended package
  function getRecommendedPackage(): string {
    if (totalCredits === 0) return "";
    if (totalCredits <= 50) return "starter";
    if (totalCredits <= 200) return "standard";
    return "pro";
  }

  const recommended = getRecommendedPackage();

  return (
    <div className="mx-auto mt-20 max-w-2xl">
      <div className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-sm backdrop-blur-sm dark:border-border/40 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10">
            <Calculator className="size-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold">{t("pricing.calculator.title")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("pricing.calculator.subtitle")}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {CALC_TOOLS.map(({ tool, icon }) => {
            const toolKey = TOOL_KEYS[tool];
            const cost = TOOL_CREDITS[tool];
            const count = counts[tool];

            return (
              <div
                key={tool}
                className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg">{icon}</span>
                  <span className="text-sm font-medium truncate">
                    {tTools(toolKey)}
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                    {tCredits("cost", { count: cost })}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() =>
                      setCounts((prev) => ({
                        ...prev,
                        [tool]: Math.max(0, prev[tool] - 1),
                      }))
                    }
                    disabled={count === 0}
                    className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-background text-sm font-bold transition-colors hover:bg-muted disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">
                    {count}
                  </span>
                  <button
                    onClick={() =>
                      setCounts((prev) => ({
                        ...prev,
                        [tool]: Math.min(100, prev[tool] + 1),
                      }))
                    }
                    className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-background text-sm font-bold transition-colors hover:bg-muted"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div className="mt-6 flex items-center justify-between rounded-xl bg-indigo-50 px-5 py-4 dark:bg-indigo-500/10">
          <span className="text-sm font-semibold text-muted-foreground">
            {t("pricing.calculator.totalNeeded")}
          </span>
          <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
            {totalCredits} {tCredits("cost", { count: "" }).replace(/^\d*\s*/, "")}
          </span>
        </div>

        {/* Recommendation */}
        {recommended && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {t("pricing.calculator.recommendation", {
              package: t(`pricing.${recommended}.name`),
            })}
          </p>
        )}
      </div>
    </div>
  );
}
