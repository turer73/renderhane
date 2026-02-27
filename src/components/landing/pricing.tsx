"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

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
    <section id="pricing" className="relative scroll-mt-20 py-20 sm:py-28">
      {/* Subtle glow behind pricing */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.7_0.15_180_/_0.03)_0%,transparent_60%)]" />

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
                className={`relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-all duration-300 hover:shadow-lg ${
                  isPopular
                    ? "border-primary/50 bg-card ring-2 ring-primary/20 shadow-lg shadow-primary/5"
                    : "border-border bg-card hover:shadow-primary/5"
                }`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute right-4 top-4">
                    <Badge className="bg-gradient-to-r from-[oklch(0.65_0.15_180)] to-[oklch(0.6_0.16_195)] text-white border-0 text-xs">
                      {t("pricing.mostPopular")}
                    </Badge>
                  </div>
                )}

                {/* Package name */}
                <h3 className="text-lg font-semibold text-foreground">
                  {t(`pricing.${pkg.key}.name`)}
                </h3>

                {/* Credits */}
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(`pricing.${pkg.key}.credits`)}
                </p>

                {/* Price */}
                <div className="mt-4">
                  <span className="text-3xl font-bold text-foreground">
                    {t(`pricing.${pkg.key}.price`)}
                  </span>
                </div>

                {/* Per-credit price */}
                {perCredit && (
                  <p className="mt-1 text-xs text-primary">
                    {perCredit}
                  </p>
                )}

                {/* Description */}
                <p className="mt-3 text-sm text-muted-foreground">
                  {t(`pricing.${pkg.key}.description`)}
                </p>

                {/* Features */}
                <ul className="mt-6 flex-1 space-y-3">
                  {pkg.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{t(`pricing.${pkg.key}.${feature}`)}</span>
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
                      className="w-full bg-gradient-to-r from-[oklch(0.65_0.15_180)] to-[oklch(0.6_0.16_195)] text-white shadow-sm shadow-primary/20"
                    >
                      <Link href={`/${locale}/login`}>
                        {t("pricing.buyNow")}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
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
