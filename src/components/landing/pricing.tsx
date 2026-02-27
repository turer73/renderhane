"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Star } from "lucide-react";

const packages = [
  {
    key: "starter" as const,
    credits: 50,
    priceValue: 49,
    features: ["feature1", "feature2", "feature3"] as const,
    popular: false,
  },
  {
    key: "standard" as const,
    credits: 200,
    priceValue: 149,
    features: ["feature1", "feature2", "feature3"] as const,
    popular: true,
  },
  {
    key: "pro" as const,
    credits: 500,
    priceValue: 299,
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

        {/* Cards */}
        <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
                className={`relative flex flex-col overflow-hidden rounded-3xl p-6 transition-all duration-300 ${
                  isPopular
                    ? "bg-gradient-to-b from-indigo-800 to-indigo-950 text-white shadow-2xl shadow-indigo-900/30 z-10 md:scale-105 ring-1 ring-indigo-500/30"
                    : "border border-border/60 bg-card text-foreground shadow-sm hover:border-indigo-300/60 hover:shadow-lg hover:shadow-indigo-100/30 dark:border-border/40 dark:hover:border-indigo-600/40 dark:hover:shadow-indigo-900/20"
                }`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <Badge className="bg-gradient-to-r from-indigo-400 to-purple-400 text-white border-0 text-xs font-bold uppercase tracking-wide whitespace-nowrap shadow-lg shadow-indigo-500/30">
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
      </div>
    </section>
  );
}
